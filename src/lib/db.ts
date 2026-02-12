import Dexie, { Table } from 'dexie';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: number;
}

export interface Memory {
  id?: number;
  content: string;
  type: 'summary' | 'fact';
  createdAt: number;
}

export class ChatDatabase extends Dexie {
  messages!: Table<Message, string>;
  memories!: Table<Memory, number>;

  constructor() {
    super('ChatDatabase');
    this.version(1).stores({
      messages: 'id, role, createdAt',
      memories: '++id, type, createdAt'
    });
  }
}

export const db = new ChatDatabase();
