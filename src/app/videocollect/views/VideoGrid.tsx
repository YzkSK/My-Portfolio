import type { DriveFile } from '../constants';
import { VideoCard } from './VideoCard';

type Props = {
  files: DriveFile[];
  tags: Record<string, string[]>;
  accessToken: string;
  playingId: string | null;
  offlineIds?: Set<string>;
  onTagEdit: (file: DriveFile) => void;
  onRename: (file: DriveFile) => void;
  onDelete: (file: DriveFile) => void;
};

export const VideoGrid = ({ files, tags, accessToken, playingId, offlineIds, onTagEdit, onRename, onDelete }: Props) => (
  <div className="vc-grid">
    {files.map(file => (
      <VideoCard
        key={file.id}
        file={file}
        tags={tags[file.id] ?? []}
        accessToken={accessToken}
        isPlaying={file.id === playingId}
        isOffline={offlineIds?.has(file.id)}
        onTagEdit={onTagEdit}
        onRename={onRename}
        onDelete={onDelete}
      />
    ))}
  </div>
);
