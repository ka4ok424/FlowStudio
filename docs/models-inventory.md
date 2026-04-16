# FlowStudio — Model & Node Inventory (Windows PC RTX 5090)

> Полный список нод FlowStudio, workflow builders, моделей и их соответствия.
> Обновлено: 2026-04-15

---

## 1. Все ноды FlowStudio (28 нод)

### Локальные ноды (генерируют через ComfyUI)
| # | Нода | Тип | Workflow builder | Иконка |
|---|------|-----|-----------------|--------|
| 1 | fs:localGenerate | Image gen | `localGen.ts` | ⚡ |
| 2 | fs:img2img | Image gen | `img2img.ts` | 🖼 |
| 3 | fs:controlNet | Image gen | `controlNet.ts` | 🎯 |
| 4 | fs:inpaint | Image edit | `inpaint.ts` | 🎨 |
| 5 | fs:inpaintCN | Image edit | `inpaintControlNet.ts` | 🎯 |
| 6 | fs:kontext | Image edit | `kontext.ts` | ✏ |
| 7 | fs:ltxVideo | Video gen | `ltxVideo.ts` | 🎬 |
| 8 | fs:wanVideo | Video gen | `wanVideo.ts` | 🎥 |
| 9 | fs:wanAnimate | Video gen | `wanAnimate.ts` | 🕺 |
| 10 | fs:hunyuanVideo | Video gen | `hunyuanVideo.ts` | 🌊 |
| 11 | fs:hunyuanAvatar | Video gen | `hunyuanAvatar.ts` | 🗣 |
| 12 | fs:nextFrame | Video gen | `nextFrame.ts` | ▶ |
| 13 | fs:removeBg | Image proc | `removeBg.ts` | ✂ |
| 14 | fs:upscale | Image proc | `upscale.ts` | 🔍 |
| 15 | fs:enhance | Image proc | `enhance.ts` | ✨ |
| 16 | fs:multiRef | Image gen | (inline in node) | 🖼 |

### Облачные/API ноды
| # | Нода | API |
|---|------|-----|
| 17 | fs:nanoBanana | Gemini API |
| 18 | fs:videoGen | Google Veo API |
| 19 | fs:videoGenPro | Google Veo Pro API |
| 20 | fs:imagen | Google Imagen API |
| 21 | fs:music | Music gen API |
| 22 | fs:tts | TTS API |
| 23 | fs:tiktokPublish | TikTok API |

### Утилитарные ноды (не генерируют)
| # | Нода | Назначение |
|---|------|-----------|
| 24 | fs:prompt | Text input |
| 25 | fs:preview | Preview output |
| 26 | fs:import | Import media |
| 27 | fs:compare | A/B compare |
| 28 | fs:characterCard | Character card |
| 29 | fs:scene | Scene description |
| 30 | fs:storyboard | Storyboard |
| 31 | fs:group | Visual group |
| 32 | fs:comment | Comment |

---

## 2. Все файлы > 400 MB на PC (ComfyUI)

### ИСПОЛЬЗУЮТСЯ в FlowStudio

| Файл | GB | Нода(ы) |
|------|----|---------|
| **Diffusion models** | | |
| `diffusion_models/flux-2-klein-9b.safetensors` | 18.16 | localGen |
| `diffusion_models/flux-2-klein-4b.safetensors` | 7.75 | localGen |
| `diffusion_models/flux2_dev_fp8mixed.safetensors` | 35.46 | localGen, img2img |
| `diffusion_models/flux1-dev.safetensors` | 23.80 | controlNet, inpaintCN |
| `diffusion_models/flux1-fill-dev.safetensors` | 23.80 | inpaint |
| `diffusion_models/flux1-kontext-dev.safetensors` | 23.80 | kontext |
| `diffusion_models/hunyuan_video_I2V_fp8_e4m3fn.safetensors` | 13.16 | hunyuanVideo |
| `diffusion_models/Wan2.2-TI2V-5B-Q8_0.gguf` | 5.40 | wanVideo |
| `diffusion_models/Wan22Animate/Wan2_2_Animate_14B_Q4_K_M.gguf` | 12.62 | wanAnimate |
| **Checkpoints** | | |
| `checkpoints/LTX-Video/ltx-2.3-22b-distilled-fp8.safetensors` | 29.53 | ltxVideo |
| `checkpoints/LTX-Video/ltx-2.3-spatial-upscaler-x2-1.1.safetensors` | 1.00 | ltxVideo (upscale) |
| `checkpoints/SUPIR-v0Q_fp16.safetensors` | 2.66 | enhance |
| **Text encoders** | | |
| `text_encoders/mistral_3_small_flux2_fp8.safetensors` | 18.03 | localGen(Flux2Dev), img2img |
| `text_encoders/qwen3_8b_klein9b.safetensors` | 16.38 | localGen(Klein9B) |
| `text_encoders/qwen_3_4b_fp4_flux2.safetensors` | 3.85 | localGen(Klein4B) |
| `text_encoders/t5xxl_fp8_e4m3fn.safetensors` | 4.89 | controlNet, inpaint, inpaintCN, kontext |
| `text_encoders/clip_l.safetensors` | 0.25 | controlNet, inpaint, inpaintCN, kontext |
| `text_encoders/models_t5_umt5-xxl-enc-bf16.pth` | 11.36 | wanVideo, wanAnimate |
| `text_encoders/gemma-3-12b-it-qat-q4_0-unquantized/` (5 shards) | 24.37 | ltxVideo |
| `text_encoders/qwen3_8b_klein9b/` (4 shards) | 16.38 | localGen(Klein9B) — дубликат? single file тоже есть |
| **CLIP / Vision** | | |
| `clip_vision/models_clip_open-clip-xlm-roberta-large-vit-huge-14.pth` | 4.77 | wanAnimate |
| `clip/clip-vit-large-patch14/model.safetensors` | 1.71 | hunyuanVideo (auto-download) |
| **VAE** | | |
| `vae/flux2-vae.safetensors` | 0.34 | localGen, img2img |
| `vae/ae.safetensors` | 0.34 | controlNet, inpaint, inpaintCN, kontext |
| `vae/hunyuan_video_vae_bf16.safetensors` | 0.49 | hunyuanVideo |
| `vae/Wan2.1_VAE.pth` | 0.51 | wanAnimate |
| `vae/VAE/Wan2.2_VAE.safetensors` | 1.41 | wanVideo |
| **HunyuanAvatar** | | |
| `HunyuanAvatar/ckpts/.../mp_rank_00_model_states_fp8.pt` | 24.85 | hunyuanAvatar |
| `HunyuanAvatar/ckpts/llava_llama_image/` (4 shards) | 16.76 | hunyuanAvatar |
| `HunyuanAvatar/ckpts/text_encoder_2/model.safetensors` | 1.71 | hunyuanAvatar |
| `HunyuanAvatar/ckpts/.../vae/pytorch_model.pt` | 0.99 | hunyuanAvatar |
| **LLM (auto-downloaded by HunyuanVideo wrapper)** | | |
| `LLM/llava-llama-3-8b-text-encoder-tokenizer/` (4 shards) | 16.07 | hunyuanVideo |
| **Other** | | |
| `RMBG/BiRefNet/` (5 models) | 3.96 | removeBg |
| `sams/sam_vit_h_4b8939.pth` | 2.56 | inpaint (SAM mask) |

### НЕ ИСПОЛЬЗУЮТСЯ в FlowStudio

| Файл | GB | Почему качалось | Можно удалить? |
|------|----|----------------|----------------|
| `diffusion_models/flux2-dev.safetensors` | 64.45 | Full FLUX 2 Dev bf16 — до появления fp8mixed | Да, если не используешь через ComfyUI GUI |
| `text_encoders/mistral_flux2.safetensors` | 48.02 | Full Mistral single — для flux2-dev | Да, парный к flux2-dev |
| `text_encoders/mistral_flux2/` (10 shards) | 48.02 | Full Mistral sharded — дубликат single | Да, точный дубликат |
| `checkpoints/sd-v1-5-inpainting.ckpt` | 4.27 | SD 1.5 inpaint — ранний этап | Да |
| `checkpoints/sdxl-inpainting.safetensors` | 5.14 | SDXL inpaint — ранний этап | Да |
| `checkpoints/sd_xl_base_1.0.safetensors` | 6.94 | SDXL base — ранний этап | Да |
| **Итого не используется** | **176.84** | | |

### ВОЗМОЖНЫЕ ДУБЛИКАТЫ (проверить)

| Файл | GB | Vs | Заметки |
|------|----|----|---------| 
| `text_encoders/qwen3_8b_klein9b.safetensors` (single) | 16.38 | `text_encoders/qwen3_8b_klein9b/` (4 shards) = 16.38 | Workflow использует single file. Shards могут быть лишние |

---

## 3. Сводка по диску

| Категория | GB |
|-----------|----|
| Используются в нодах | ~435 |
| Не используются | ~177 |
| Возможные дубликаты | ~16 |
| **Всего** | **~612** |
| **Можно освободить** | **~193** |
