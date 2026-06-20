"use client";

interface UploadProgressProps {
  /** 0-100 upload progress */
  uploadProgress: number;
  /** Whether upload is in progress */
  isUploading: boolean;
  /** Whether transcoding is in progress */
  isTranscoding: boolean;
  /** Per-quality transcoding progress */
  transcodeProgress: Record<string, number>;
  /** File name being processed */
  fileName?: string;
}

export default function UploadProgress({
  uploadProgress,
  isUploading,
  isTranscoding,
  transcodeProgress,
  fileName,
}: UploadProgressProps) {
  const qualities = Object.keys(transcodeProgress);
  const avgTranscodeProgress =
    qualities.length > 0
      ? qualities.reduce((sum, q) => sum + transcodeProgress[q], 0) /
        qualities.length
      : 0;

  return (
    <div className="w-full bg-white/[0.03] backdrop-blur-xl border border-white/[0.06] rounded-2xl p-6 space-y-5">
      {/* File name */}
      {fileName && (
        <div className="flex items-center gap-2">
          <svg
            className="w-5 h-5 text-violet-400 shrink-0"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
            />
          </svg>
          <span className="text-white/80 text-sm font-medium truncate">
            {fileName}
          </span>
        </div>
      )}

      {/* Upload Stage */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
            {isUploading
              ? "Uploading..."
              : uploadProgress >= 100
                ? "Uploaded"
                : "Upload"}
          </span>
          <span className="text-xs font-bold text-violet-400">
            {uploadProgress}%
          </span>
        </div>
        <div className="w-full h-2 bg-white/[0.06] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-violet-600 to-fuchsia-500 rounded-full transition-all duration-300 ease-out relative"
            style={{ width: `${uploadProgress}%` }}
          >
            {isUploading && (
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            )}
          </div>
        </div>
      </div>

      {/* Transcode Stage */}
      {(isTranscoding || qualities.length > 0) && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-white/60 uppercase tracking-wider">
              {isTranscoding ? "Transcoding..." : "Transcoded"}
            </span>
            <span className="text-xs font-bold text-cyan-400">
              {Math.round(avgTranscodeProgress)}%
            </span>
          </div>

          {/* Per-quality progress bars */}
          <div className="space-y-2">
            {qualities.map((quality) => (
              <div key={quality} className="flex items-center gap-3">
                <span className="text-[10px] font-bold text-white/40 w-14 text-right uppercase">
                  {quality}
                </span>
                <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-cyan-500 to-blue-500 rounded-full transition-all duration-500 ease-out"
                    style={{ width: `${transcodeProgress[quality]}%` }}
                  />
                </div>
                <span className="text-[10px] font-mono text-white/30 w-8">
                  {transcodeProgress[quality]}%
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Status message */}
      {isTranscoding && (
        <p className="text-xs text-white/30 text-center">
          Processing your file — this may take a few minutes for large files
        </p>
      )}
    </div>
  );
}
