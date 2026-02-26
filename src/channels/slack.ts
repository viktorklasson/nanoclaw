import { App, LogLevel } from '@slack/bolt';

import { ASSISTANT_NAME, TRIGGER_PATTERN } from '../config.js';
import { readEnvFile } from '../env.js';
import { logger } from '../logger.js';
import { Channel, OnChatMetadata, OnInboundMessage, RegisteredGroup } from '../types.js';

const slackEnv = readEnvFile(['SLACK_BOT_TOKEN', 'SLACK_APP_TOKEN', 'SLACK_CHANNEL_ID']);

export interface SlackChannelOpts {
  onMessage: OnInboundMessage;
  onChatMetadata: OnChatMetadata;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
}

export class SlackChannel implements Channel {
  name = 'slack';
  private app: App;
  private connected = false;
  private opts: SlackChannelOpts;
  private channelId: string;
  private botUserId: string | null = null;

  constructor(opts: SlackChannelOpts) {
    this.opts = opts;
    this.channelId = slackEnv.SLACK_CHANNEL_ID ?? '';

    this.app = new App({
      token: slackEnv.SLACK_BOT_TOKEN,
      appToken: slackEnv.SLACK_APP_TOKEN,
      socketMode: true,
      // Suppress Bolt's default logger
      logLevel: LogLevel.ERROR,
    });

    this.setupHandlers();
  }

  private setupHandlers(): void {
    this.app.message(async ({ message, client }) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const msg = message as any;

      // Ignore bot messages and message edits/deletes (but allow file_share)
      if (msg.bot_id) return;
      if (msg.subtype && msg.subtype !== 'file_share') return;
      if (!msg.text || !msg.user) return;

      const isMainChannel = msg.channel === this.channelId;
      const isDM = msg.channel_type === 'im';
      const isChannel = msg.channel_type === 'channel' || msg.channel_type === 'group';

      // Only handle channels the bot is in (DMs, main channel, or other channels)
      if (!isMainChannel && !isDM && !isChannel) return;

      // Rewrite Slack-style bot mention (<@U123>) to @AssistantName early
      // so we can check the trigger pattern before reacting
      let content: string = msg.text;
      if (this.botUserId) {
        content = content.replace(
          new RegExp(`<@${this.botUserId}>`, 'g'),
          `@${ASSISTANT_NAME}`,
        );
      }

      // Only react with :eyes: when we'll actually process the message:
      // always on main channel and DMs, only on trigger in other channels
      const groups = this.opts.registeredGroups();
      const jid = `slack:${msg.channel}`;
      const group = groups[jid];
      const needsTrigger = group && group.requiresTrigger !== false;
      const hasTrigger = TRIGGER_PATTERN.test(content.trim());
      if (isMainChannel || isDM || !needsTrigger || hasTrigger) {
        client.reactions.add({
          channel: msg.channel,
          timestamp: msg.ts,
          name: 'eyes',
        }).catch(() => {
          // Non-fatal — reaction may already exist or permissions may be missing
        });
      }

      const timestamp = new Date(parseFloat(msg.ts) * 1000).toISOString();

      // Resolve user display name
      let senderName = msg.user;
      try {
        const userInfo = await client.users.info({ user: msg.user });
        const user = userInfo.user as { real_name?: string; name?: string } | undefined;
        senderName = user?.real_name ?? user?.name ?? (msg.user as string);
      } catch {
        // Non-fatal — fall back to user ID
      }

      // Auto-register new channels and DMs
      if (!groups[jid]) {
        if (isDM) {
          const folder = `slack-dm-${msg.user}`;
          this.opts.registerGroup(jid, {
            name: `Slack DM: ${senderName}`,
            folder,
            trigger: '',
            added_at: new Date().toISOString(),
            requiresTrigger: false,
          });
          logger.info({ jid, senderName }, 'Auto-registered Slack DM');
        } else if (!isMainChannel) {
          // Resolve channel name for the folder/display name
          let channelName = msg.channel as string;
          try {
            const info = await client.conversations.info({ channel: msg.channel });
            channelName = (info.channel as any)?.name ?? channelName;
          } catch {
            // Non-fatal — fall back to channel ID
          }
          const folder = `slack-${channelName}`;
          this.opts.registerGroup(jid, {
            name: `Slack #${channelName}`,
            folder,
            trigger: '',
            added_at: new Date().toISOString(),
            requiresTrigger: true,
          });
          logger.info({ jid, channelName }, 'Auto-registered Slack channel');
        }
      }

      // Resolve chat display name
      let chatName: string;
      if (isDM) {
        chatName = `DM: ${senderName}`;
      } else if (isMainChannel) {
        chatName = '#assistant';
      } else {
        const currentGroups = this.opts.registeredGroups();
        chatName = currentGroups[jid]?.name ?? `#${msg.channel}`;
      }
      this.opts.onChatMetadata(jid, timestamp, chatName, 'slack', !isDM);

      // Only deliver message content if the group is registered
      const updatedGroups = this.opts.registeredGroups();
      if (updatedGroups[jid]) {
        this.opts.onMessage(jid, {
          id: msg.ts,
          chat_jid: jid,
          sender: msg.user,
          sender_name: senderName,
          content,
          timestamp,
          is_from_me: false,
          is_bot_message: false,
        });
      }
    });
  }

  ownsJid(jid: string): boolean {
    return jid.startsWith('slack:');
  }

  async connect(): Promise<void> {
    if (!slackEnv.SLACK_BOT_TOKEN || !slackEnv.SLACK_APP_TOKEN) {
      logger.warn('SLACK_BOT_TOKEN or SLACK_APP_TOKEN not set — Slack channel disabled');
      return;
    }
    await this.app.start();
    this.connected = true;

    // Resolve bot's own user ID so we can detect @mentions
    try {
      const auth = await this.app.client.auth.test();
      this.botUserId = auth.user_id as string;
      logger.info({ botUserId: this.botUserId }, 'Resolved bot user ID');
    } catch {
      logger.warn('Failed to resolve bot user ID — @mention trigger may not work');
    }

    logger.info({ channelId: this.channelId }, 'Slack channel connected');
  }

  async sendMessage(jid: string, text: string, blocks?: unknown[]): Promise<void> {
    const channel = jid.replace('slack:', '');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const payload: any = { channel, text };
    if (blocks && Array.isArray(blocks) && blocks.length > 0) {
      payload.blocks = blocks;
    }
    await this.app.client.chat.postMessage(payload);
  }

  isConnected(): boolean {
    return this.connected;
  }

  async disconnect(): Promise<void> {
    if (this.connected) {
      await this.app.stop();
      this.connected = false;
    }
  }
}
