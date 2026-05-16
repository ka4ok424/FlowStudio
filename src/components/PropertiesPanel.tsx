import { useWorkflowStore } from "../store/workflowStore";
import ImportProperties from "./properties/ImportProperties";
import LocalGenProperties from "./properties/LocalGenProperties";
import NanoBananaProperties from "./properties/NanoBananaProperties";
import GroupProperties from "./properties/GroupProperties";
import CommentProperties from "./properties/CommentProperties";
import UpscaleProperties from "./properties/UpscaleProperties";
import TikTokProperties from "./properties/TikTokProperties";
import VideoGenProProperties from "./properties/VideoGenProProperties";
import VideoGenProperties from "./properties/VideoGenProperties";
import ImagenProperties from "./properties/ImagenProperties";
import MusicProperties from "./properties/MusicProperties";
import TtsProperties from "./properties/TtsProperties";
import RemoveBgProperties from "./properties/RemoveBgProperties";
import EnhanceProperties from "./properties/EnhanceProperties";
import InpaintProperties from "./properties/InpaintProperties";
import Img2ImgProperties from "./properties/Img2ImgProperties";
import NextFrameProperties from "./properties/NextFrameProperties";
import FrameExtractProperties from "./properties/FrameExtractProperties";
import CropProperties from "./properties/CropProperties";
import MultiCropProperties from "./properties/MultiCropProperties";
import MontageProperties from "./properties/MontageProperties";
import KontextProperties from "./properties/KontextProperties";
import LtxVideoProperties from "./properties/LtxVideoProperties";
import LtxLoraProperties from "./properties/LtxLoraProperties";
import LtxFlfProperties from "./properties/LtxFlfProperties";
import LtxFmlProperties from "./properties/LtxFmlProperties";
// import MultiRefProperties from "./properties/MultiRefProperties"; // REMOVED
import SceneProperties from "./properties/SceneProperties";
import StoryboardProperties from "./properties/StoryboardProperties";
import CharacterCardProperties from "./properties/CharacterCardProperties";
import PromptProperties from "./properties/PromptProperties";
import ControlNetProperties from "./properties/ControlNetProperties";
import InpaintCNProperties from "./properties/InpaintCNProperties";
import WanVideoProperties from "./properties/WanVideoProperties";
import WanSmoothProperties from "./properties/WanSmoothProperties";
import MmAudioProperties from "./properties/MmAudioProperties";
import OmniVoiceTtsProperties from "./properties/OmniVoiceTtsProperties";
import OmniVoiceCloneProperties from "./properties/OmniVoiceCloneProperties";
import WanAnimateProperties from "./properties/WanAnimateProperties";
import HunyuanVideoProperties from "./properties/HunyuanVideoProperties";
import HunyuanAvatarProperties from "./properties/HunyuanAvatarProperties";
import DescribeProperties from "./properties/DescribeProperties";
import LlmTextProperties from "./properties/LlmTextProperties";
import DatasetProperties from "./properties/DatasetProperties";
import BatchProperties from "./properties/BatchProperties";
import TextProperties from "./properties/TextProperties";
import StickerProperties from "./properties/StickerProperties";
import ComfyProperties from "./properties/ComfyProperties";
import SmoothFpsProperties from "./properties/SmoothFpsProperties";

const PROPERTY_MAP: Record<string, React.ComponentType<{ nodeId: string; data: any }>> = {
  "fs:import": ImportProperties,
  "fs:localGenerate": LocalGenProperties,
  "fs:nanoBanana": NanoBananaProperties,
  "fs:group": GroupProperties,
  "fs:comment": CommentProperties,
  "fs:upscale": UpscaleProperties,
  "fs:smoothFps": SmoothFpsProperties,
  "fs:tiktokPublish": TikTokProperties,
  "fs:videoGenPro": VideoGenProProperties,
  "fs:videoGen": VideoGenProperties,
  "fs:imagen": ImagenProperties,
  "fs:music": MusicProperties,
  "fs:tts": TtsProperties,
  "fs:removeBg": RemoveBgProperties,
  "fs:enhance": EnhanceProperties,
  "fs:inpaint": InpaintProperties,
  "fs:img2img": Img2ImgProperties,
  "fs:nextFrame": NextFrameProperties,
  "fs:frameExtract": FrameExtractProperties,
  "fs:crop": CropProperties,
  "fs:multiCrop": MultiCropProperties,
  "fs:montage": MontageProperties,
  "fs:kontext": KontextProperties,
  "fs:ltxVideo": LtxVideoProperties,
  "fs:ltxLora": LtxLoraProperties,
  "fs:ltxFlf": LtxFlfProperties,
  "fs:ltxFml": LtxFmlProperties,
  "fs:mmaudio": MmAudioProperties,
  "fs:omnivoiceTts": OmniVoiceTtsProperties,
  "fs:omnivoiceClone": OmniVoiceCloneProperties,
  // "fs:multiRef": MultiRefProperties, // REMOVED
  "fs:scene": SceneProperties,
  "fs:storyboard": StoryboardProperties,
  "fs:characterCard": CharacterCardProperties,
  "fs:prompt": PromptProperties as any,
  "fs:controlNet": ControlNetProperties,
  "fs:inpaintCN": InpaintCNProperties,
  "fs:wanVideo": WanVideoProperties,
  "fs:wanSmooth": WanSmoothProperties,
  "fs:wanAnimate": WanAnimateProperties,
  "fs:hunyuanVideo": HunyuanVideoProperties,
  "fs:hunyuanAvatar": HunyuanAvatarProperties,
  "fs:describe": DescribeProperties,
  "fs:critique": LlmTextProperties,
  "fs:refine": LlmTextProperties,
  "fs:dataset": DatasetProperties,
  "fs:batch": BatchProperties,
  "fs:text": TextProperties,
  "fs:sticker": StickerProperties,
};

export default function PropertiesPanel() {
  const { nodes, selectedNodeId } = useWorkflowStore();
  const node = nodes.find((n) => n.id === selectedNodeId);

  if (!node) return null;

  const data = node.data as any;
  const isNative = data._native;
  const PropsComponent = PROPERTY_MAP[data.type];

  return (
    <div className="properties-panel">
      <div className="props-header">
        <span className="props-dot" />
        <span className="props-title">{data.label}</span>
        <span className="props-type-badge">{data.type?.replace("fs:", "")}</span>
      </div>

      <div className="props-content">
        {PropsComponent && <PropsComponent nodeId={node.id} data={data} />}
        {!isNative && <ComfyProperties data={data} />}
      </div>
    </div>
  );
}
