# Meo Meo Caro

Game cờ ca-rô (Tic Tac Toe) chủ đề mèo, chơi được theo ba cách:

- **Đấu với máy** — 3 độ khó, chơi hoàn toàn offline sau lần tải đầu.
- **2 người cùng máy** — chung một thiết bị, luân phiên đánh.
- **Online** — tạo phòng bằng mã 5 ký tự, chia sẻ link `?room=CODE`, máy chủ xác thực toàn bộ nước đi.

Toàn bộ hình mèo, quân cờ, icon và hiệu ứng là **SVG gốc vẽ tay bằng code**, không dùng hình ảnh ngoài và không dùng nhân vật có bản quyền. Âm thanh được tổng hợp bằng Web Audio (không có file mp3).

---

## Tính năng

| Nhóm | Chi tiết |
| --- | --- |
| Chế độ chơi | AI (Mèo con / Mèo trưởng thành / Mèo thông thái), 2 người cùng máy, online theo phòng |
| AI | Dễ: 30% đi theo chiến thuật; Vừa: thắng → chặn → giữa → góc → cạnh, 20% ngẫu nhiên; Khó: minimax + alpha-beta, không bao giờ thua |
| Bàn cờ | 3×3, quân là mặt mèo có biểu cảm thường/thắng/thua, đường thắng vẽ bằng sợi len, confetti cá và dấu chân mèo |
| Giao diện | Tiếng Việt mặc định, chuyển sang tiếng Anh; font Baloo 2 + Nunito; tông kem/hồng/cam/xanh, viền mực dày kiểu sticker |
| Cài đặt | Bật/tắt âm thanh, nhạc nền, giảm chuyển động; tên người chơi ≤12 ký tự; 6 avatar mèo |
| Lưu trữ | localStorage: hồ sơ, cài đặt, bảng điểm AI và 2 người; tự chuyển sang bộ nhớ tạm nếu trình duyệt chặn localStorage |
| Online | Mã phòng tránh ký tự dễ nhầm (`0 O 1 I L`), đồng hồ 30 giây/lượt, tự đánh nước hợp lệ khi hết giờ, kết nối lại trong 60 giây, thay tab cũ bằng tab mới, 6 biểu cảm với cooldown 2 giây, đấu lại khi cả hai đồng ý |
| PWA | Manifest, icon 192/512, service worker cache app shell, cài lên màn hình chính, chơi AI khi mất mạng |
| Bảo mật | Máy chủ là nguồn sự thật; làm sạch tên/avatar; giới hạn 10 sự kiện/giây/socket; tối đa 1000 phòng; không gửi `playerKey` cho đối thủ |

---

## Công nghệ

- HTML5, CSS3, JavaScript ES Modules thuần (không framework, không bước build).
- Node.js ≥ 18, Express 4, Socket.IO 4, helmet, compression.
- Web Audio API tổng hợp âm thanh; Canvas cho confetti.
- `socket.io-client` chỉ dùng cho test tích hợp.

---

## Cấu trúc thư mục

```text
meo-meo-caro/
├── package.json
├── package-lock.json
├── server.js                 # Express + Socket.IO, nguồn sự thật của chế độ online
├── README.md
├── public/
│   ├── index.html            # 5 màn hình, 3 dialog, toast, banner, canvas confetti
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                 # service worker: app shell + offline AI
│   ├── css/
│   │   └── style.css         # toàn bộ giao diện, responsive, reduced-motion
│   ├── assets/
│   │   └── cats.js           # SVG gốc: 6 mèo, mascot, dấu chân, cá, len, chuông
│   ├── icons/
│   │   ├── icon.svg
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   └── js/
│       ├── main.js           # bộ điều khiển trung tâm (điều hướng, ván chơi, online)
│       ├── game-core.js      # bàn cờ, luật thắng/thua/hòa, đặt quân
│       ├── ai.js             # AI 3 độ khó, minimax + alpha-beta
│       ├── online.js         # bọc Socket.IO phía client
│       ├── ui.js             # render bàn cờ, hiệu ứng, toast, timer, confetti
│       ├── audio.js          # âm thanh tổng hợp Web Audio
│       ├── storage.js        # localStorage an toàn + fallback bộ nhớ
│       └── i18n.js           # chuỗi tiếng Việt / tiếng Anh
└── test/
    ├── ai.test.mjs           # test luật chơi + AI (gồm duyệt cạn AI Khó)
    └── server.test.mjs       # test tích hợp Socket.IO với server thật
```

---

## Chạy dự án

```bash
npm install
npm start
```

Mở `http://localhost:3000`.

Chế độ phát triển (tự khởi động lại khi sửa server):

```bash
npm run dev
```

> Các module ES yêu cầu chạy qua HTTP, không mở trực tiếp `public/index.html` bằng `file://`.

### Biến môi trường

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `PORT` | `3000` | Cổng server |
| `CORS_ORIGIN` | (trống) | Danh sách origin được phép, phân cách bằng dấu phẩy. Chỉ cần đặt khi client và server khác origin |
| `ROOM_TTL_MS` | `900000` | Thời gian phòng không hoạt động trước khi bị dọn (15 phút) |
| `RECONNECT_GRACE_MS` | `60000` | Thời gian giữ chỗ khi người chơi mất kết nối |
| `TURN_MS` | `30000` | Thời gian tối đa mỗi lượt online |

Ba biến cuối chủ yếu dùng cho test; khi chạy thật không cần đặt.

---

## Chơi online

1. Mở `http://localhost:3000`, nhập tên, chọn avatar.
2. Chọn **Chơi online** → **Tạo phòng**. Nhận mã 5 ký tự.
3. Gửi mã hoặc bấm **Sao chép link** / **Chia sẻ** cho người thứ hai.
4. Người thứ hai mở link (hoặc nhập mã ở mục **Vào phòng**). Ai đi trước được chọn ngẫu nhiên.
5. Mỗi lượt có 30 giây; hết giờ máy chủ tự đánh một nước hợp lệ ngẫu nhiên và phát sự kiện `game:timeout`.
6. Kết thúc ván, cả hai có thể bấm **Đấu lại**; chỉ khi cả hai đồng ý ván mới bắt đầu và người đi trước đổi bên.

### Test online trên cùng máy tính

Mở hai cửa sổ ẩn danh (hoặc hai trình duyệt khác nhau) để không dùng chung localStorage. Hai tab thường của cùng một trình duyệt cũng chơi được, nhưng mở tab mới sẽ **thay thế** tab cũ trong cùng phòng — đây là hành vi chống trùng phiên, không phải lỗi.

### Test online trong mạng LAN

Chạy server, lấy địa chỉ IP nội bộ (ví dụ `192.168.1.10`), mở `http://192.168.1.10:3000` trên máy thứ hai. Không cần đặt `CORS_ORIGIN` vì client và server cùng origin. Kiểm tra firewall nếu không kết nối được.

### Test online qua Internet (tạm thời)

```bash
npx cloudflared tunnel --url http://localhost:3000
# hoặc
npx ngrok http 3000
```

Mở URL công khai mà công cụ in ra. Giữ nguyên một origin cho cả hai người chơi.

---

## Triển khai

### Render

1. Đưa mã nguồn lên GitHub.
2. Render → **New → Web Service** → chọn repo.
3. Runtime: **Node**. Build command: `npm install`. Start command: `npm start`.
4. Health check path: `/health`.
5. Không cần biến môi trường; Render tự cấp `PORT`. Nếu dùng tên miền riêng cho API khác origin, đặt `CORS_ORIGIN=https://ten-mien-cua-ban`.

### Railway

1. Railway → **New Project → Deploy from GitHub repo**.
2. Nixpacks tự nhận Node và chạy `npm start`. Không cần đặt `PORT`.
3. Thêm health check `/health` nếu muốn.

### Lưu ý khi vận hành

- Phòng và điểm online chỉ nằm trong RAM: **khởi động lại hoặc deploy phiên bản mới sẽ xoá các phòng đang chơi**. Client sẽ nhận `room:closed` và quay về trang chủ.
- Ứng dụng chỉ chạy tốt với **một instance**. Muốn mở rộng ngang, cần Redis adapter cho Socket.IO và nơi lưu trạng thái phòng dùng chung (xem mục nâng cấp).
- WebSocket phải được proxy hỗ trợ. Render/Railway mặc định đã hỗ trợ; với nginx, thêm header `Upgrade`/`Connection`.

### PWA

- Bản build phục vụ trên HTTPS (localhost cũng được) thì trình duyệt mới cho cài và cache.
- Sau lần tải đầu, app shell được cache; chọn chế độ AI hoặc 2 người vẫn chơi được khi offline. Chế độ online cần server.
- Khi sửa CSS/JS/ảnh, tăng `CACHE_NAME` trong `public/sw.js` (ví dụ `meo-meo-caro-v2`) để người dùng nhận bản mới.

---

## Kiểm thử tự động

```bash
npm test          # chạy cả hai bộ test
npm run test:ai
npm run test:server
```

- `test/ai.test.mjs`: kiểm tra 8 đường thắng, hòa, ưu tiên nước thắng cuối cùng, chặn nước đi sai, mở bàn của AI Khó, thắng/chặn của AI Vừa, và **duyệt cạn** mọi nhánh với AI Khó (1164 thế kết thúc, 0 thua).
- `test/server.test.mjs`: khởi động server thật ở cổng ngẫu nhiên và kiểm tra tạo/join phòng, làm sạch tên, không lộ `playerKey`, chặn sai lượt/ô đã đánh/chỉ số sai, thắng do server tính, đấu lại cần 2 phiếu, cooldown biểu cảm, phòng đầy/mã sai, ngắt kết nối rồi vào lại, tab mới thay tab cũ, rời phòng, xoá phòng chờ, hết giờ tự đánh, và rate limit.

---

## 18 kịch bản kiểm thử thủ công

| # | Kịch bản | Cách làm | Kết quả mong đợi |
| --- | --- | --- | --- |
| 1 | Trang chủ | Mở app lần đầu | Mascot mèo vẫy tay, 3 nút chế độ, điểm số, đổi ngôn ngữ VI/EN; không lỗi console |
| 2 | Làm sạch tên | Nhập `  Mèo   <b>Cam</b>  ` | Tên thành `Mèo b Cam /b` (đã bỏ `< >`, gộp khoảng trắng, cắt còn 12 ký tự); thoát ra vào lại vẫn giữ tên |
| 3 | Tên rỗng | Xoá trắng ô tên rồi chơi | Dùng tên mặc định "Mèo Con" (EN: "Little Cat") |
| 4 | AI Dễ | Chọn Mèo con, chơi hết ván | AI có lúc đánh ngẫu nhiên; mọi nước đều hợp lệ |
| 5 | AI Vừa | Tạo thế AI có 2 quân liền, đến lượt AI | AI thắng ngay nếu có thể; nếu người chơi sắp thắng, AI chặn |
| 6 | AI Khó | Chơi 3–5 ván | AI không thua ván nào; thường hòa hoặc thắng |
| 7 | Lượt đi đầu | Chọn "Tôi đi trước" / "Máy đi trước" / "Ngẫu nhiên" ở màn hình AI | Đúng người đi trước; nút chọn được đánh dấu rõ |
| 8 | 2 người cùng máy | Chơi vài lượt | Xen kẽ A/B, tên và avatar đúng; đánh vào ô đã có quân bị rung + báo "O này có mèo rồi!" |
| 9 | Thắng 3 kiểu | Tạo thắng hàng ngang, hàng dọc, đường chéo | Đường len nối 3 quân, confetti, thẻ kết quả đúng người thắng, điểm cộng 1 |
| 10 | Hòa | Điền kín 9 ô không ai thắng | Thẻ "Hòa", điểm hòa +1, không vẽ đường thắng |
| 11 | Tạo phòng | Online → Tạo phòng | Mã đúng 5 ký tự thuộc bộ `A–Z` (bỏ I, L, O) và `2–9`; nút copy/share hoạt động; link có `?room=CODE` |
| 12 | Vào phòng | Tab 2 mở link hoặc nhập mã viết thường có khoảng trắng | Vào đúng phòng, thấy tên/avatar hai bên, đồng hồ 30 giây chạy, người đi trước ngẫu nhiên |
| 13 | Lượt sai | Bấm ô khi chưa đến lượt hoặc khi đối thủ đang nghĩ | Bị chặn, có thông báo; server cũng từ chối nếu cố gửi |
| 14 | Hết giờ | Không đánh trong 30 giây | Máy chủ tự đánh một nước hợp lệ, hiện thông báo hết giờ, lượt chuyển |
| 15 | F5 khi đang chơi | Tải lại trang | Tự vào lại phòng cũ trong 60 giây, bàn cờ/điểm/lượt được khôi phục, đồng hồ chạy tiếp |
| 16 | Mất kết nối | Đóng tab hoặc tắt mạng một bên | Bên còn lại thấy banner "đối thủ mất kết nối", đồng hồ dừng; vào lại trong 60 giây thì tiếp tục; quá 60 giây thì người ở lại thắng do bỏ cuộc |
| 17 | Thay tab | Mở tab mới vào cùng link phòng | Tab mới tiếp quản phiên; tab cũ hiện thông báo và trở về trang chủ, không xoá phiên của tab mới |
| 18 | Đấu lại & biểu cảm | Kết thúc ván, một bên bấm Đấu lại rồi cả hai bấm; gửi 2 biểu cảm liên tiếp | Chỉ khi đủ 2 phiếu mới có ván mới, người đi trước đổi bên; biểu cảm thứ hai bị chặn 2 giây; rời phòng có xác nhận và đối thủ nhận `room:closed` |

Thử thêm: nhập mã `ABC` → báo mã không hợp lệ; mã 5 ký tự không tồn tại → báo không tìm thấy phòng; người thứ ba vào phòng đủ 2 người → báo phòng đầy; người tạo phòng rời khi đang chờ → phòng bị xoá ngay; chặn localStorage (chế độ ẩn danh có chặn) → app vẫn chạy bằng bộ nhớ tạm.

---

## Quyết định thiết kế & giả định

- **Hết giờ = tự đánh ngẫu nhiên một nước hợp lệ.** Cách này giữ ván tiếp diễn, tránh treo phòng; máy chủ phát `game:timeout` để client hiển thị thông báo.
- **Server là nguồn sự thật.** Client chỉ gửi ý định (`game:move` với chỉ số ô). Server kiểm tra phòng, thành viên, trạng thái, lượt, chỉ số, ô trống rồi mới tính thắng/hòa và phát trạng thái.
- **`playerKey` chỉ dùng để vào lại phòng**, được trả trong ack tạo/join/rejoin và lưu sessionStorage; không bao giờ xuất hiện trong `room:state` gửi cho người khác.
- **Phòng trong RAM.** Phù hợp một instance, đơn giản và không cần cơ sở dữ liệu; đánh đổi là mất phòng khi restart.
- **Không tài khoản, không chat tự do.** Chỉ có biểu cảm giới hạn để tránh lạm dụng.
- **Không dùng ảnh/font nhân vật có bản quyền.** Font tải từ Google Fonts, mọi hình khác là SVG nội bộ; khi offline, font tự fallback hệ thống.

---

## Gỡ lỗi

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
| --- | --- | --- |
| `EADDRINUSE` | Cổng 3000 bận | `PORT=3001 npm start` |
| Trang trắng, console báo module | Mở bằng `file://` | Chạy `npm start` và dùng `http://localhost:3000` |
| Không kết nối được Socket.IO | Proxy/CDN chặn WebSocket | Bật WebSocket trên proxy; kiểm tra đường dẫn `/socket.io/` |
| Online báo "phòng không tồn tại" | Server đã restart hoặc phòng hết hạn | Tạo phòng mới |
| Không thấy bản mới sau khi deploy | Service worker cache | Hard reload hoặc tăng `CACHE_NAME` trong `sw.js` |
| Âm thanh không phát | Trình duyệt chặn autoplay trước thao tác đầu | Bấm vào màn hình một lần; kiểm tra nút âm thanh đang bật |
| Không cài được PWA | Không phải HTTPS/localhost | Dùng HTTPS khi triển khai |
| Vào link phòng nhưng bị đá về nhà | Tab khác đã thay thế phiên | Đóng tab cũ, vào lại link ở tab đang dùng |

---

## Hướng nâng cấp (tối đa 5)

1. **Redis adapter + lưu phòng** để chạy nhiều instance và không mất ván khi deploy.
2. **Tài khoản nhẹ và bảng xếp hạng tuần** dùng chung giữa các thiết bị.
3. **Chế độ khán giả / xem lại ván** bằng cách phát lại chuỗi nước đi đã lưu.
4. **Chat nhanh có kiểm duyệt** (câu mẫu, không nhập tự do) và lời mời kết bạn.
5. **Bàn cờ lớn hơn (4×4, 5×5)** với AI tối ưu độ sâu và luật chặn hai đầu.

---

## Giấy phép

MIT. Không có tài sản của bên thứ ba ngoài font Google Fonts (theo giấy phép của Google Fonts).
