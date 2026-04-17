import { useMediaStore, type MediaItem } from "../store/mediaStore";

export type ImportMediaType = "none" | "image" | "video" | "audio";

function formatSize(bytes: number): string {
  if (bytes < 1024) return bytes + " B";
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + " KB";
  return (bytes / (1024 * 1024)).toFixed(1) + " MB";
}

export function detectMediaType(mime: string): ImportMediaType {
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  return "none";
}

/**
 * Processes a File: writes widgetValues (_mediaType, _fileName, _preview, _fileInfo),
 * schedules async metadata extraction, and (optionally) adds the file to the media library
 * as an imported item. Shared between ImportNode.handleFile and canvas-level file drops.
 */
export function processImportFile(
  file: File,
  opts: {
    setValue: (key: string, value: any) => void;
    addToMediaLibrary?: boolean;
  }
): { type: ImportMediaType; url: string } {
  const { setValue, addToMediaLibrary = true } = opts;
  const type = detectMediaType(file.type);
  const url = URL.createObjectURL(file);
  const ext = file.name.split(".").pop()?.toUpperCase() || "";
  const fileInfo: Record<string, string | number> = { size: formatSize(file.size), format: ext };

  setValue("_mediaType", type);
  setValue("_fileName", file.name);
  setValue("_preview", url);
  setValue("_fileInfo", fileInfo);

  if (type === "image") {
    const img = new Image();
    img.onload = () => {
      fileInfo.resolution = `${img.width} × ${img.height}`;
      setValue("_fileInfo", { ...fileInfo });
    };
    img.src = url;
  } else if (type === "video") {
    const video = document.createElement("video");
    video.onloadedmetadata = () => {
      const dur = video.duration;
      const mins = Math.floor(dur / 60);
      const secs = Math.floor(dur % 60);
      fileInfo.duration = `${mins}:${secs.toString().padStart(2, "0")}`;
      fileInfo.resolution = `${video.videoWidth} × ${video.videoHeight}`;
      if ("requestVideoFrameCallback" in video) {
        let frameCount = 0;
        video.muted = true;
        video.currentTime = 0;
        const onFrame = () => {
          frameCount++;
          if (video.currentTime < dur - 0.01) {
            (video as any).requestVideoFrameCallback(onFrame);
            video.currentTime = Math.min(video.currentTime + 0.001, dur);
          } else {
            const fps = Math.round(frameCount / dur);
            fileInfo.fps = fps;
            fileInfo.frames = frameCount;
            setValue("_fileInfo", { ...fileInfo });
            video.src = "";
          }
        };
        video.onseeked = () => {
          (video as any).requestVideoFrameCallback(onFrame);
        };
        video.currentTime = 0.001;
      } else {
        const fps = 24;
        fileInfo.fps = fps;
        fileInfo.frames = Math.round(dur * fps);
        setValue("_fileInfo", { ...fileInfo });
      }
    };
    video.src = url;
  } else if (type === "audio") {
    const audio = new Audio();
    audio.onloadedmetadata = () => {
      const mins = Math.floor(audio.duration / 60);
      const secs = Math.floor(audio.duration % 60);
      fileInfo.duration = `${mins}:${secs.toString().padStart(2, "0")}`;
      setValue("_fileInfo", { ...fileInfo });
    };
    audio.src = url;
  }

  if (addToMediaLibrary && type === "image") {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (reader.result && typeof reader.result === "string") {
        const item: MediaItem = {
          id: `imp_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          type,
          url: reader.result,
          fileName: file.name,
          source: "imported",
          favorite: false,
          createdAt: Date.now(),
        };
        useMediaStore.getState().addItem(item);
      }
    };
    reader.readAsDataURL(file);
  }

  return { type, url };
}
