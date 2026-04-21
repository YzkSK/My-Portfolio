import type { DriveFile } from '../constants';
import { VideoCard } from './VideoCard';

type Props = {
  files: DriveFile[];
  tags: Record<string, string[]>;
  onTagEdit: (file: DriveFile) => void;
};

export const VideoGrid = ({ files, tags, onTagEdit }: Props) => (
  <div className="vc-grid">
    {files.map(file => (
      <VideoCard
        key={file.id}
        file={file}
        tags={tags[file.id] ?? []}
        onTagEdit={onTagEdit}
      />
    ))}
  </div>
);
