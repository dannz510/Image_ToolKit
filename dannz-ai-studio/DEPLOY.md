# Deploy Dannz AI Studio lên Vercel từ GitHub

Hướng dẫn đầy đủ từ push code lên GitHub → website chạy thật trên Vercel, dựa trên
cấu hình thực tế của repo này (`vercel.json`, `api/*.py`, `package.json`) và đã kiểm
chứng bằng cách đọc source của Vercel CLI / builder `@vercel/python`.

> **Lưu ý quan trọng về vị trí thư mục:** repo GitHub
> (`github.com/dannz510/Image_ToolKit`) chứa nhiều project, app này nằm trong thư mục
> con **`dannz-ai-studio/`**. Khi tạo project trên Vercel bắt buộc phải đặt
> **Root Directory = `dannz-ai-studio`**, nếu không Vercel sẽ build nhầm thư mục gốc
> và deploy sẽ lỗi.
>
> Gốc repo còn có một `requirements.txt` riêng (cho app Streamlit cũ:
> `streamlit`, `rembg`, `onnxruntime`, `pillow` không pin). Vercel luôn dùng
> `requirements.txt` **gần function nhất** — builder đi từ thư mục `api/` ngược lên —
> nên hãy giữ Root Directory = `dannz-ai-studio` để dependencies lấy từ
> `dannz-ai-studio/api/requirements.txt`, không phải file ở gốc (sai deps và dễ
> chạm ngưỡng kích thước bundle).

---

## 1. Deploy cái gì?

| Thành phần | Chạy ở đâu trên Vercel | Ghi chú |
|---|---|---|
| Toàn bộ UI (React + Vite + Tailwind + Fabric.js) | **Static build** → `dist/` | Build bằng `npm run build`, output `dist` |
| `api/health.py` | Serverless Function `/api/health` | Python 3.11, export `handler` |
| `api/remove_bg.py` | Serverless Function `/api/remove_bg` | rembg + onnxruntime |
| `api/fetch_image.py` | Serverless Function `/api/fetch_image` | Tải ảnh từ URL (phía server, không bị CORS) |
| `api/server.py` | **KHÔNG deploy** | Chỉ là router chạy local (`npm run api`); không export `handler` nên Vercel bỏ qua |
| `public/` (manifest, sw.js, fonts, icons) | Được copy vào `dist/` | PWA/offline vẫn hoạt động sau deploy |

Frontend gọi `/api/*` **cùng origin**, nên không cần đổi `API_BASE` trong
`src/services/api.ts` và CSP `connect-src 'self'` không chặn gì cả.

**Dependencies của function nằm ở `api/requirements.txt`** (rembg, onnxruntime,
pillow, numpy) — builder `@vercel/python` đi từ thư mục của function (`api/`)
ngược lên cho tới gốc project để tìm `requirements.txt`, nên phân cấp này hoạt
động đúng và không cần file requirements ở thư mục gốc.

---

## 2. Điều kiện tiên quyết

- Tài khoản **GitHub** đã push repo: <https://github.com/dannz510/Image_ToolKit>
- Tài khoản **Vercel** (Hobby miễn phí là đủ) — đăng nhập bằng chính tài khoản GitHub
- Local: **Node 18+** (khuyến nghị Node 20/22, cùng bản mà Vercel dùng) và
  **Python 3.11** nếu muốn test API trước khi deploy
- Không cần API key nào: model AI là open-source (rembg), tải tự động khi chạy lần đầu

---

## 3. Chuẩn bị repo (bước hay bị bỏ qua)

Vercel deploy **từ GitHub**, nên mọi thay đổi phải được commit + push trước.

```bash
# trong D:\Do not open\Extract IMG
git add -A
git commit -m "chore: ready for vercel deploy"
git push origin main
```

Kiểm tra đây đủ 4 file API và config cần thiết đã nằm trong git (đừng commit nhầm
model/build output):

```bash
git ls-files dannz-ai-studio/api dannz-ai-studio/vercel.json
# → api/fetch_image.py · api/health.py · api/remove_bg.py · api/requirements.txt
#   api/server.py (chỉ chạy local) · vercel.json
```

`dannz-ai-studio/.gitignore` đã lo sẵn: `node_modules/`, `dist/`, `__pycache__/`,
`.rembg/`, `.u2net/`, `.env*` — nên repo chỉ có source.

---

## 4. Bước 1 — Tạo project Vercel từ GitHub

1. Vào <https://vercel.com/new> (hoặc Dashboard → **Add New… → Project**).
2. Chọn **Import Git Repository** → repo `dannz510/Image_ToolKit`.
   - Nếu chưa thấy repo: bấm **Adjust GitHub App Permissions** và cấp quyền cho repo.
3. Ở mục **Configure Project**, điền:

   | Ô trong UI | Giá trị | Vì sao |
   |---|---|---|
   | **Root Directory** | `dannz-ai-studio` | App nằm trong thư mục con của repo ⚠️ |
   | **Framework Preset** | `Vite` | Build chuẩn Vite |
   | **Build Command** | `npm run build` | `tsc && vite build` — typecheck + bundle |
   | **Output Directory** | `dist` | Đúng `outputDirectory` trong `vercel.json` |
   | **Install Command** | `npm install` | Mặc định |

   > `vercel.json` đã khai báo sẵn các giá trị trên (`framework`, `buildCommand`,
   > `outputDirectory`) nên Vercel thường tự điền đúng — chỉ cần chắc chắn
   > **Root Directory** đúng.

4. Bấm **Deploy** và đợi ~1–2 phút (build Vite + cài dependencies Python cho 3 function).

---

## 5. Bước 2 — Biến môi trường (tất cả đều tùy chọn)

Vào **Project → Settings → Environment Variables**, thêm nếu cần:

| Biến | Giá trị mặc định | Khi nào cần đặt |
|---|---|---|
| `ALLOWED_ORIGINS` | *(rỗng)* | Chỉ khi frontend nằm ở **domain khác** với API, ví dụ `https://app.example.com` (cách nhau bởi dấu phẩy). Rỗng = chỉ same-origin — an toàn nhất |
| `ALLOW_HEAVY_MODELS` | `0` | Đặt `1` để bật `u2net` / `isnet-*` (model nặng 170 MB). Mặc định tắt để tránh cold start 100+ MB |
| `MAX_BODY_BYTES` | `4718592` (4.5 MB) | Trần kích thước ảnh upload |
| `INFERENCE_TIMEOUT` | `25` | Số giây chờ slot inference trước khi trả 429 |
| `MAX_CONCURRENCY` | `1` | Số ảnh chạy song song trên 1 instance |

**Tuyệt đối không đặt `DANNZ_DEV=1` trên production** — biến này chỉ để mở CORS
localhost khi dev local (xem `.env.example`).

Không cần biến nào khác: app chạy được với cấu hình mặc định ngay sau deploy.

---

## 6. Bước 3 — Kiểm tra sau khi deploy

Thay `https://<domain-cua-ban>` bằng domain Vercel vừa cấp:

```bash
# 1. API còn sống + model sẵn có
curl https://<domain>/api/health
#    → {"status":"ok","service":"dannz-ai-studio-api","models":["u2netp","silueta","u2net_human_seg"],
#       "default_model":"u2netp","heavy_models":[...],"heavy_models_enabled":false,"warm":true}

# 2. Xóa nền thật (dùng ảnh PNG/JPEG bất kỳ)
curl -X POST https://<domain>/api/remove_bg \
     -F "image=@photo.jpg" -F "model=u2netp" -o cutout.png
#    → 200, image/png trong suốt, header X-Processing-Time-Ms
```

Kiểm tra trên trình duyệt:

- [ ] Mở domain → thấy màn hình DropZone (video nền nếu mạng cho phép CDN)
- [ ] Kéo-thả / **Browse** ảnh → ảnh được xử lý tự động, thời gian hiện ở dưới
- [ ] Ô **dán link** nhập `https://picsum.photos/200` → tải được (nhờ `/api/fetch_image`)
- [ ] Đổi ngôn ngữ VI/EN, đổi theme sáng/tối
- [ ] Cài PWA: Chrome sẽ gợi ý *Install app*, mở lại khi offline vẫn vào được shell
- [ ] F12 → Application → **Service Workers** phải thấy sw.js ở trạng thái *activated*

> **Lần gọi `/api/remove_bg` đầu tiên sẽ chậm hơn** (~5–10 giây): function lạnh phải
> tải `u2netp.onnx` (~4.4 MB) từ GitHub về `/tmp`. Model nặng (`u2net`, `isnet-*`)
> ~170 MB và chỉ tải khi bạn bật `ALLOW_HEAVY_MODELS=1`.

---

## 7. Auto-deploy từ GitHub (mỗi lần push)

Mặc định Vercel tạo 2 nhánh triển khai:

| Hành động | Kết quả |
|---|---|
| `git push origin main` | Deploy **Production** (domain chính) |
| Push / mở **Pull Request** | Deploy **Preview** ở URL riêng, không ảnh hưởng production |

Đổi domain: **Project → Settings → Domains → Add** (trỏ thêm domain mua riêng,
Vercel tự cấp SSL). Xem log build: **Project → Deployments → chọn deployment → View Build Logs**.

Rollback nhanh: **Deployments → chọn bản cũ → ⋯ → Promote to Production**.

---

## 8. Deploy thủ công bằng CLI (thay thế)

```bash
npm i -g vercel
vercel login            # đăng nhập bằng GitHub
cd "D:\Do not open\Extract IMG\dannz-ai-studio"
vercel link             # chọn/ tạo project, repo vẫn là nguồn deploy cho lần sau
vercel                 # deploy thử (preview URL)
vercel --prod          # deploy production ngay
```

`vercel` đọc đúng `vercel.json` nên không cần tham số gì thêm.

---

## 9. Giới hạn cần biết (bảng đã kiểm chứng)

| Giới hạn | Giá trị | Ảnh hưởng / cách app xử lý |
|---|---|---|
| Bundle Python function | **500 MB** (uncompressed) | Thư viện thực tế ~295 MB (cv2 112 MB, scipy 85 MB, skimage 20 MB, onnxruntime 41 MB, numpy 20 MB, pillow 14 MB) → nằm trong hạn mức; **vượt** ngưỡng cũ 250 MB nếu Vercel dùng path cũ |
| Thời lượng function (Hobby) | 300 s tối đa | `vercel.json` đặt `maxDuration: 30`; inference mặc định `u2netp` ~0.5–3 s |
| Memory (Hobby) | 2 GB | Đủ cho ảnh tối đa 1600 px; inference chạy tuần tự (semaphore 1) nên chỉ một ảnh được giữ trong RAM tại một thời điểm |
| Kích thước request | 4.5 MB (`MAX_BODY_BYTES`) | Client tự nén/chỉnh ảnh trước khi upload |
| Model weights | `/tmp` trên Vercel | Cold start đầu tiên tải model; `/tmp` không giữ lại giữa các lần cold boot |
| Concurrency inference | 1 (`MAX_CONCURRENCY`) | Dùng semaphore phía server, request sau nhận 429 nếu quá `INFERENCE_TIMEOUT` |

---

## 10. Xử lý sự cố thường gặp

| Triệu chứng | Nguyên nhân | Cách sửa |
|---|---|---|
| Build fail ngay từ đầu: không nhận diện được framework / không tìm thấy `package.json` trong thư mục đã chọn | Root Directory chưa trỏ vào `dannz-ai-studio` | Settings → General → Root Directory → `dannz-ai-studio` → Redeploy |
| Trang mở được nhưng `/api/health` 404 | `functions` không match: `api/*.py` phải nằm trong Root Directory | Kiểm tra lại Root Directory, xem log build có 3 Python functions không |
| `/api/remove_bg` trả 500 lần đầu | Function lạnh đang tải model | Gọi lại sau vài giây; theo dõi log function |
| ảnh xóa nền bị chặn "model not enabled" | Đang chọn `u2net`/`isnet-*` mà `ALLOW_HEAVY_MODELS` chưa bật | Set `ALLOW_HEAVY_MODELS=1` rồi redeploy, hoặc chọn `u2netp` |
| Dán link ảnh báo lỗi | `/api/fetch_image` chặn IP nội bộ (SSRF guard) hoặc URL không phải http(s) | Dùng URL công khai `https://...`; link `http://127.0.0.1` chỉ chạy khi dev |
| CORS error khi gọi API từ domain khác | API mặc định chỉ same-origin | Set `ALLOWED_ORIGINS=https://domain-khac.com` |
| Sau khi deploy mới, web vẫn hiện bản cũ | Service Worker cache | Hard reload (Ctrl+Shift+R); SW tự cập nhật ở lần load kế tiếp |
| Trang trắng, console lỗi CSP | Asset ngoài (ảnh/font/script) không nằm trong allowlist CSP trong `vercel.json` | Thêm host vào directive tương ứng (`img-src`, `media-src`, `font-src`) rồi commit lại |
| Build lỗi "bundle exceeded" | Dependencies vượt 500 MB | Kiểm tra `api/requirements.txt` không thêm package thừa; hoặc bật Large Functions (`VERCEL_SUPPORT_LARGE_FUNCTIONS=1`, cần Fluid compute) |

---

## 11. Tóm tắt 1 dòng

```bash
git add -A && git commit -m "deploy" && git push origin main
```

→ Vercel tự build `dannz-ai-studio/dist/` + 3 function `/api/*` → xong. Chỉ cần đặt
đúng **Root Directory = `dannz-ai-studio`** một lần duy nhất.
