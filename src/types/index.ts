export type InterpretationType = 'consecutive' | 'simultaneous' | 'sight' | 'self-paced';

export interface Topic {
  id: string;
  name: string;
  description: string;
  createdAt: number;
  updatedAt: number;
}

export interface PracticeMaterial {
  id: string;
  topicId: string;
  title: string;
  type: 'audio' | 'video' | 'text';
  sourceLanguage: 'en' | 'zh';
  targetLanguage: 'en' | 'zh';
  interpretationType: InterpretationType;
  difficulty?: 1 | 2 | 3;
  sourceContent?: string;
  referenceTranslation?: string;
  mediaUrl?: string;
  mediaBlob?: string;      // base64
  duration?: number;
  createdAt: number;
}

export interface PracticeSession {
  id: string;
  materialId: string;
  topicId: string;
  startedAt: number;
  completedAt?: number;
  recordingBlob?: string;  // base64
  transcription?: string;
  score?: ScoreResult;
}

export interface ScoreResult {
  overall: number;
  accuracy: number;
  completeness: number;
  fluency: number;
  details: ScoreDetail[];
}

export interface ScoreDetail {
  category: string;
  score: number;
  feedback: string;
}