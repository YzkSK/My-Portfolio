import type { DriveFile } from '../constants';
import { VideoCard } from './VideoCard';

type Props = {
  files: DriveFile[];
  tags: Record<string, string[]>;
  accessToken: string;
  onTagEdit: (file: DriveFile) => void;
};

export const VideoGrid = ({ files, tags, accessToken, onTagEdit }: Props) => (
  <div className="vc-grid">
    {files.map(file => (
      <VideoCard
        key={file.id}
        file={file}
        tags={tags[file.id] ?? []}
        accessToken={accessToken}
        onTagEdit={onTagEdit}
      />
    ))}
  </div>
);
