import { supabase } from './supabase';
import type { Topic, PracticeMaterial, PracticeSession } from '../types';

export function generateId(): string {
  return crypto.randomUUID();
}

async function getUserId(): Promise<string> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('未登录');
  return user.id;
}

// ── Input Validation Helpers ──────────────────────────────────

function validateTopic(topic: Topic): Topic {
  return {
    ...topic,
    name: (topic.name ?? '').trim(),
    description: (topic.description ?? '').trim(),
  };
}

function validateMaterial(material: PracticeMaterial): PracticeMaterial {
  return {
    ...material,
    title: (material.title ?? '').trim(),
    sourceContent: (material.sourceContent ?? '').trim(),
    referenceTranslation: (material.referenceTranslation ?? '').trim(),
    mediaUrl: (material.mediaUrl ?? '').trim(),
    sourceLanguage: material.sourceLanguage ?? 'en',
    targetLanguage: material.targetLanguage ?? 'zh',
    interpretationType: material.interpretationType ?? 'consecutive',
    type: material.type ?? 'audio',
  };
}

function validateSession(session: PracticeSession): PracticeSession {
  return {
    ...session,
    transcription: (session.transcription ?? '').trim(),
  };
}

export async function initDB() { return true; }

// ── Topics ────────────────────────────────────────────────────

export async function getAllTopics(): Promise<Topic[]> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id, name: r.name, description: r.description ?? '',
    createdAt: r.created_at, updatedAt: r.updated_at,
  }));
}

export async function saveTopic(topic: Topic): Promise<void> {
  const userId = await getUserId();
  const validated = validateTopic(topic);
  const { error } = await supabase.from('topics').upsert({
    id: validated.id, user_id: userId,
    name: validated.name, description: validated.description,
    created_at: validated.createdAt, updated_at: validated.updatedAt,
  });
  if (error) throw error;
}

export async function deleteTopic(id: string): Promise<void> {
  const userId = await getUserId();
  const { error } = await supabase.from('topics').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

export async function getTopic(id: string): Promise<Topic | undefined> {
  const { data, error } = await supabase.from('topics').select('*').eq('id', id).single();
  if (error) return undefined;
  return { id: data.id, name: data.name, description: data.description ?? '', createdAt: data.created_at, updatedAt: data.updated_at };
}

// ── Materials ─────────────────────────────────────────────────

export async function getAllMaterials(): Promise<PracticeMaterial[]> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('materials')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id, topicId: r.topic_id, title: r.title,
    type: r.type, sourceLanguage: r.source_language,
    targetLanguage: r.target_language,
    interpretationType: r.interpretation_type,
    difficulty: r.difficulty,
    sourceContent: r.source_content,
    referenceTranslation: r.reference_translation,
    mediaUrl: r.media_url,
    mediaBlob: undefined,
    duration: r.duration, createdAt: r.created_at,
  }));
}

export async function saveMaterial(material: PracticeMaterial): Promise<void> {
  const userId = await getUserId();
  const validated = validateMaterial(material);
  const { error } = await supabase.from('materials').upsert({
    id: validated.id, user_id: userId, topic_id: validated.topicId,
    title: validated.title, type: validated.type,
    source_language: validated.sourceLanguage,
    target_language: validated.targetLanguage,
    interpretation_type: validated.interpretationType,
    difficulty: validated.difficulty,
    source_content: validated.sourceContent,
    reference_translation: validated.referenceTranslation,
    media_url: validated.mediaUrl,
    duration: validated.duration, created_at: validated.createdAt,
  });
  if (error) throw error;
}

export async function deleteMaterial(id: string): Promise<void> {
  const userId = await getUserId();
  const { error } = await supabase.from('materials').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

export async function getMaterial(id: string): Promise<PracticeMaterial | undefined> {
  const { data, error } = await supabase.from('materials').select('*').eq('id', id).single();
  if (error) return undefined;
  return {
    id: data.id, topicId: data.topic_id, title: data.title,
    type: data.type, sourceLanguage: data.source_language,
    targetLanguage: data.target_language,
    interpretationType: data.interpretation_type,
    difficulty: data.difficulty, sourceContent: data.source_content,
    referenceTranslation: data.reference_translation,
    mediaUrl: data.media_url, mediaBlob: undefined,
    duration: data.duration, createdAt: data.created_at,
  };
}

// ── Sessions ──────────────────────────────────────────────────

export async function getAllSessions(): Promise<PracticeSession[]> {
  const userId = await getUserId();
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .order('started_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map(r => ({
    id: r.id, materialId: r.material_id, topicId: r.topic_id,
    startedAt: r.started_at, completedAt: r.completed_at,
    recordingBlob: r.recording_blob,
    transcription: r.transcription, score: r.score,
  }));
}

export async function saveSession(session: PracticeSession): Promise<void> {
  const userId = await getUserId();
  const validated = validateSession(session);
  const { error } = await supabase.from('sessions').upsert({
    id: validated.id, user_id: userId,
    material_id: validated.materialId, topic_id: validated.topicId,
    started_at: validated.startedAt, completed_at: validated.completedAt,
    recording_blob: validated.recordingBlob,
    transcription: validated.transcription, score: validated.score,
  });
  if (error) throw error;
}

export async function deleteSession(id: string): Promise<void> {
  const userId = await getUserId();
  const { error } = await supabase.from('sessions').delete().eq('id', id).eq('user_id', userId);
  if (error) throw error;
}

export async function getSessionsByMaterial(materialId: string): Promise<PracticeSession[]> {
  const { data, error } = await supabase.from('sessions').select('*').eq('material_id', materialId);
  if (error) return [];
  return (data ?? []).map(r => ({
    id: r.id, materialId: r.material_id, topicId: r.topic_id,
    startedAt: r.started_at, completedAt: r.completed_at,
    recordingBlob: r.recording_blob,
    transcription: r.transcription, score: r.score,
  }));
}
