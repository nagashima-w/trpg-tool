import { readFileSync, writeFileSync, readdirSync, statSync } from 'fs';
import { join, extname, basename } from 'path';
import { randomUUID } from 'crypto';
import type { Track } from '../shared/types';

const SUPPORTED_EXTENSIONS = ['.mp3', '.ogg', '.wav', '.flac'];

export class TrackManager {
  private tracksPath: string;
  private tracks: Track[];

  constructor(userDataPath: string) {
    this.tracksPath = join(userDataPath, 'tracks.json');
    this.tracks = this.load();
  }

  private load(): Track[] {
    try {
      return JSON.parse(readFileSync(this.tracksPath, 'utf-8')) as Track[];
    } catch {
      return [];
    }
  }

  private save(): void {
    try {
      writeFileSync(this.tracksPath, JSON.stringify(this.tracks, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to save tracks:', err);
    }
  }

  getAll(): Track[] {
    return [...this.tracks];
  }

  getById(id: string): Track | undefined {
    return this.tracks.find((t) => t.id === id);
  }

  addFiles(filePaths: string[]): Track[] {
    const added: Track[] = [];
    for (const filePath of filePaths) {
      const ext = extname(filePath).toLowerCase();
      if (!SUPPORTED_EXTENSIONS.includes(ext)) continue;
      if (this.tracks.some((t) => t.filePath === filePath)) continue;
      const name = basename(filePath, ext);
      const track: Track = {
        id: randomUUID(),
        name,
        filePath,
      };
      this.tracks.push(track);
      added.push(track);
    }
    if (added.length > 0) {
      this.save();
    }
    return added;
  }

  addFolder(folderPath: string): Track[] {
    try {
      const entries = readdirSync(folderPath);
      const filePaths = entries
        .filter((entry) => {
          const fullPath = join(folderPath, entry);
          return (
            SUPPORTED_EXTENSIONS.includes(extname(entry).toLowerCase()) &&
            statSync(fullPath).isFile()
          );
        })
        .map((entry) => join(folderPath, entry));
      return this.addFiles(filePaths);
    } catch (err) {
      console.error('Failed to read folder:', err);
      return [];
    }
  }

  remove(id: string): void {
    const index = this.tracks.findIndex((t) => t.id === id);
    if (index !== -1) {
      this.tracks.splice(index, 1);
      this.save();
    }
  }

  rename(id: string, name: string): void {
    const track = this.tracks.find((t) => t.id === id);
    if (track) {
      track.name = name;
      this.save();
    }
  }

  reorder(ids: string[]): void {
    const map = new Map(this.tracks.map((t) => [t.id, t]));
    const reordered: Track[] = [];
    for (const id of ids) {
      const t = map.get(id);
      if (t) reordered.push(t);
    }
    // Append any tracks not in the ids list (safety net)
    for (const t of this.tracks) {
      if (!ids.includes(t.id)) reordered.push(t);
    }
    this.tracks = reordered;
    this.save();
  }

  updateDuration(id: string, durationMs: number): void {
    const track = this.tracks.find((t) => t.id === id);
    if (track) {
      track.durationMs = durationMs;
      this.save();
    }
  }
}
