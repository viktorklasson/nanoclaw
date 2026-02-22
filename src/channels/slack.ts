import { App, LogLevel } from '@slack/bolt';

import { ASSISTANT_NAME } from '../config.js';
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

      // Ignore bot messages and message edits/deletes
      if (msg.subtype || msg.bot_id) return;
      if (!msg.text || !msg.user) return;

      const isMainChannel = msg.channel === this.channelId;
      const isDM = msg.channel_type === 'im';

      if (!isMainChannel && !isDM) return;

      const jid = `slack:${msg.channel}`;
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

      // Auto-register new DM conversations
      const groups = this.opts.registeredGroups();
      if (isDM && !groups[jid]) {
        const folder = `slack-dm-${msg.user}`;
        this.opts.registerGroup(jid, {
          name: `Slack DM: ${senderName}`,
          folder,
          trigger: '',
          added_at: new Date().toISOString(),
          requiresTrigger: false,
        });
        logger.info({ jid, senderName }, 'Auto-registered Slack DM');
      }

      const chatName = isDM ? `DM: ${senderName}` : '#assistant';
      this.opts.onChatMetadata(jid, timestamp, chatName, 'slack', !isDM);

      // Only deliver message content if the group is registered
      const updatedGroups = this.opts.registeredGroups();
      if (updatedGroups[jid]) {
        this.opts.onMessage(jid, {
          id: msg.ts,
          chat_jid: jid,
          sender: msg.user,
          sender_name: senderName,
          content: msg.text,
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
    logger.info({ channelId: this.channelId }, 'Slack channel connected');
  }

  async sendMessage(jid: string, text: string): Promise<void> {
    const channel = jid.replace('slack:', '');
    await this.app.client.chat.postMessage({
      channel,
      text,
    });
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
