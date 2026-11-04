# Meo Meo Caro

Game cờ ca-rô (Tic Tac Toe) chủ đề mèo với bàn **3×3 đến 8×8**, chơi được theo ba cách:

- **Đấu với máy** — 3 độ khó, chọn cỡ bàn, chơi hoàn toàn offline sau lần tải đầu.
- **2 người cùng máy** — chung một thiết bị, chọn cỡ bàn rồi luân phiên đánh.
- **Online** — tạo phòng bằng mã 5 ký tự, người tạo chọn cỡ bàn, chia sẻ link `?room=CODE`, máy chủ xác thực toàn bộ nước đi.

Toàn bộ hình mèo, quân cờ, icon và hiệu ứng là **SVG gốc vẽ tay bằng code**, không dùng hình ảnh ngoài và không dùng nhân vật có bản quyền. Âm thanh được tổng hợp bằng Web Audio (không có file mp3).

---

## Tính năng

| Nhóm | Chi tiết |
| --- | --- |
| Chế độ chơi | AI (Mèo con / Mèo trưởng thành / Mèo thông thái), 2 người cùng máy, online theo phòng |
| Cỡ bàn | 3×3, 4×4, 5×5, 6×6, 7×7, 8×8. Luật thắng: 3 quân (3×3), 4 quân (4×4), 5 quân (5×5 trở lên); chuỗi dài hơn vẫn thắng |
| AI | Dễ: phần lớn ngẫu nhiên, thỉnh thoảng thắng/chặn ngay; Vừa: thắng → chặn → chấm điểm chuỗi + ưu tiên giữa, ~20% ngẫu nhiên; Khó: minimax + alpha-beta có giới hạn thời gian, chỉ bàn 3×3 là hoàn hảo |
| Bàn cờ | Lưới N×N dựng động, quân là mặt mèo có biểu cảm thường/thắng/thua, đánh dấu nước vừa đi, đường thắng bằng sợi len nối đúng chuỗi thắng, confetti cá và dấu chân mèo |
| Giao diện | Tiếng Việt mặc định, chuyển sang tiếng Anh; font Baloo 2 + Nunito; tông kem/hồng/cam/xanh, viền mực dày kiểu sticker; bàn co giãn vuông, không tràn ngang kể cả 8×8 trên màn 320px |
| Cài đặt | Bật/tắt âm thanh, nhạc nền, giảm chuyển động; tên người chơi ≤12 ký tự; 6 avatar mèo; ghi nhớ cỡ bàn đã chọn |
| Lưu trữ | localStorage: hồ sơ, cài đặt, bảng điểm **riêng theo từng cỡ bàn** cho AI (3 độ khó) và 2 người; tự chuyển sang bộ nhớ tạm nếu trình duyệt chặn localStorage; dữ liệu 3×3 cũ được tự động chuyển sang mục 3×3 |
| Online | Mã phòng tránh ký tự dễ nhầm (`0 O 1 I L`), người tạo chọn cỡ bàn, đồng hồ 30 giây/lượt (5×5 trở lên: 45 giây), tự đánh nước hợp lệ khi hết giờ, kết nối lại trong 60 giây, thay tab cũ bằng tab mới, 6 biểu cảm với cooldown 2 giây, đấu lại giữ nguyên cỡ bàn khi cả hai đồng ý |
| PWA | Manifest, icon 192/512, service worker cache app shell (gồm cả AI worker), cài lên màn hình chính, chơi AI khi mất mạng |
| Bảo mật | Máy chủ là nguồn sự thật, tự suy ra luật thắng từ cỡ bàn; làm sạch tên/avatar; giới hạn 10 sự kiện/giây/socket; tối đa 1000 phòng; không gửi `playerKey` cho đối thủ |

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
│   ├── index.html            # 6 màn hình (có bước chọn cỡ bàn), 3 dialog, toast, banner
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                 # service worker: app shell + offline AI (cache v3)
│   ├── css/
│   │   └── style.css         # giao diện động N×N, responsive, reduced-motion
│   ├── assets/
│   │   └── cats.js           # SVG gốc: 6 mèo, mascot, dấu chân, cá, len, chuông
│   ├── icons/
│   │   ├── icon.svg
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   └── js/
│       ├── main.js           # bộ điều khiển trung tâm (điều hướng, ván chơi, online)
│       ├── game-core.js      # cấu hình cỡ bàn, bàn cờ, luật thắng/thua/hòa
│       ├── ai.js             # AI 3 độ khó cho 3×3–8×8 (minimax + alpha-beta)
│       ├── ai-worker.js      # Web Worker chạy AI bàn lớn, tránh đơ giao diện
│       ├── ai-client.js      # gọi worker, timeout/hủy, fallback main thread
│       ├── online.js         # bọc Socket.IO phía client
│       ├── ui.js             # render bàn N×N, hiệu ứng, toast, timer, confetti
│       ├── audio.js          # âm thanh tổng hợp Web Audio
│       ├── storage.js        # localStorage an toàn + fallback bộ nhớ
│       └── i18n.js           # chuỗi tiếng Việt / tiếng Anh
└── test/
    ├── ai.test.mjs           # test luật chơi 3×3–8×8, AI các cỡ bàn, duyệt cạn AI Khó 3×3
    └── server.test.mjs       # test tích hợp Socket.IO với server thật (gồm 4×4, 8×8)
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
| `TURN_MS` | (trống) | Ghi đè thời gian mỗi lượt cho test. Khi để trống: 30 giây cho 3×3–4×4, 45 giây cho 5×5–8×8 |

`ROOM_TTL_MS`, `RECONNECT_GRACE_MS` và `TURN_MS` chủ yếu dùng cho test; khi chạy thật không cần đặt.

---

## Chơi online

1. Mở `http://localhost:3000`, nhập tên, chọn avatar.
2. Chọn **Chơi online** → chọn cỡ bàn → **Tạo phòng**. Nhận mã 5 ký tự; cỡ bàn và luật thắng hiển thị ở phòng chờ.
3. Gửi mã hoặc bấm **Sao chép link** / **Chia sẻ** cho người thứ hai.
4. Người thứ hai mở link (hoặc nhập mã ở mục **Vào phòng**). Họ thấy đúng cỡ bàn của phòng; ai đi trước được chọn ngẫu nhiên.
5. Mỗi lượt có 30 giây (5×5 trở lên: 45 giây); hết giờ máy chủ tự đánh một ô trống ngẫu nhiên, không xử thua, và phát sự kiện `game:timeout`.
6. Kết thúc ván, cả hai có thể bấm **Đấu lại**; chỉ khi cả hai đồng ý ván mới bắt đầu, giữ nguyên cỡ bàn và đổi người đi trước.

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
- Khi sửa CSS/JS/ảnh, tăng `CACHE_NAME` trong `public/sw.js` (hiện tại `meo-meo-caro-v3`) để người dùng nhận bản mới. Cache v3 đã gồm `ai-worker.js` và `ai-client.js`.

---

## Kiểm thử tự động

```bash
npm test          # chạy cả hai bộ test
npm run test:ai
npm run test:server
```

- `test/ai.test.mjs`: kiểm tra cấu hình cỡ bàn, thắng đủ 4 hướng ở góc/cạnh/giữa trên 3×3–8×8, chuỗi ngắn không thắng, không vòng qua cuối hàng, chuỗi dài hơn luật vẫn thắng, hòa, ưu tiên nước thắng cuối cùng, AI 3×3 (mở bàn, thắng, chặn, góc), **duyệt cạn AI Khó 3×3** (1164 thế kết thúc, 0 thua), AI mọi độ khó/cỡ bàn chỉ trả ô trống, 72 ván AI tự chơi, thắng/chặn ngay của AI bàn lớn, và giới hạn thời gian của AI Khó bàn lớn.
- `test/server.test.mjs`: khởi động server thật ở cổng ngẫu nhiên và kiểm tra tạo/join phòng, làm sạch tên, không lộ `playerKey`, chặn sai lượt/ô đã đánh/chỉ số sai, thắng do server tính, đấu lại cần 2 phiếu, cooldown biểu cảm, phòng đầy/mã sai, ngắt kết nối rồi vào lại, tab mới thay tab cũ, rời phòng, xoá phòng chờ, hết giờ tự đánh, rate limit; thêm **cỡ bàn 4×4/8×8**: mặc định 3×3, từ chối cỡ sai, đúng luật thắng 4/5 quân, thắng 4×4, hòa kín bàn 4×4, đấu lại giữ cỡ bàn, F5 rejoin giữ `size`/`board`/`lastMove`, timer 30s/45s và timeout 8×8 không xử thua.

---

## 32 kịch bản kiểm thử thủ công

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
| 19 | Chọn cỡ bàn AI | Mở Đấu với máy, bấm lần lượt 3×3 → 8×8 | Nút được chọn nổi bật; dòng luật đổi đúng `3 quân / 4 quân / 5 quân`; tải lại trang vẫn nhớ cỡ bàn cuối |
| 20 | Bàn 4×4 | Chọn 4×4, chơi với AI Vừa đến khi kết thúc | 16 ô vuông vức; thắng cần đúng 4 quân; điểm được cộng vào mục 4×4, không ảnh hưởng 3×3 |
| 21 | Bàn 6×6 | Chọn 6×6, chơi với máy | Lưới 36 ô, quân mèo co vừa ô; AI đi trong khoảng ~1 giây; đường thắng nối đúng 5 ô |
| 22 | Bàn 8×8 trên desktop | Chọn 8×8 | Bàn vuông tối đa ~640px, 64 ô, không tràn; nước vừa đi có viền đứt nét |
| 23 | Bàn 8×8 trên màn 320–360px | Thu cửa sổ/devtools về 320px, chọn 8×8 | Không có thanh cuộn ngang; ô nhỏ khoảng 32–36px nhưng vẫn bấm/chạm được; chữ luật không tràn |
| 24 | Thắng 5 quân | Trên 5×5/6×6/7×7/8×8 tạo thắng ngang, dọc, chéo | Thắng đúng khi đủ 5; sợi len phủ trọn chuỗi thắng; confetti và thẻ kết quả hiện |
| 25 | Chuỗi dài hơn luật | Trên 6×6 tạo 6 quân liên tiếp | Vẫn thắng; sợi len nối cả 6 quân, không cắt ở quân thứ 5 |
| 26 | 4 quân chưa thắng trên 6×6 | Trên 6×6 đặt đúng 4 quân liên tiếp rồi dừng | Chưa có kết quả thắng; ván tiếp tục |
| 27 | 2 người cùng máy chọn cỡ bàn | Chọn 2 người → chọn 5×5 → Bắt đầu | Màn chờ chọn cỡ bàn hiện ra; bàn 25 ô; điểm 2 người lưu riêng cho 5×5 |
| 28 | Bảng điểm theo cỡ bàn | Mở Bảng điểm, đổi bộ lọc 3×3 ↔ 6×6 | Số liệu đổi theo cỡ bàn; nút xóa ghi rõ cỡ bàn; xóa 6×6 không làm mất điểm 3×3 |
| 29 | Online chọn cỡ bàn | Người tạo chọn 6×6, người kia vào bằng mã | Phòng chờ và màn chơi của cả hai đều ghi `6×6 · cần 5 quân liên tiếp` |
| 30 | Online 4×4 / 8×8 | Chơi thắng, hòa (4×4), F5 giữa ván, đấu lại | F5 khôi phục đúng cỡ bàn/bàn cờ/nước cuối; đấu lại vẫn đúng cỡ bàn; thắng 8×8 cần 5 quân |
| 31 | Hết giờ bàn lớn | Chạy `TURN_MS=2000 npm start`, chơi online 6×6, không đánh | Sau ~2 giây máy chủ tự đánh ô trống, ván tiếp tục, không bị xử thua; khi chạy thật bàn 5×5+ là 45 giây |
| 32 | Bàn phím & i18n bàn lớn | Chọn 8×8, dùng Tab/mũi tên tới sát biên; đổi sang English | Không lọt ra ngoài lưới; nhãn đọc đúng hàng/cột; toàn bộ tên cỡ bàn, luật thắng, bộ lọc điểm và nút xóa đổi sang tiếng Anh |

Thử thêm: chọn 8×8 rồi bật Giảm chuyển động → không nhấp nháy viền nước đi/confetti; xóa localStorage rồi tải lại → bảng điểm về 0 nhưng app vẫn chạy; chặn localStorage → app dùng bộ nhớ tạm; nhập mã `ABC` → báo mã không hợp lệ; mã 5 ký tự không tồn tại → báo không tìm thấy phòng; người thứ ba vào phòng đủ 2 người → báo phòng đầy; người tạo phòng rời khi đang chờ → phòng bị xoá ngay.

---

## Quyết định thiết kế & giả định

- **Hết giờ = tự đánh ngẫu nhiên một ô trống.** Cách này giữ ván tiếp diễn, tránh treo phòng; máy chủ phát `game:timeout` để client hiển thị thông báo. Bàn 5×5 trở lên có 45 giây/lượt, bàn nhỏ hơn 30 giây.
- **Server là nguồn sự thật.** Client chỉ gửi ý định (`game:move` với chỉ số ô). Server kiểm tra phòng, thành viên, trạng thái, lượt, chỉ số, ô trống rồi mới tính thắng/hòa và phát trạng thái. Server tự suy ra `winLength` từ `size`; client không thể gửi luật thắng riêng.
- **Luật thắng dùng chung một file.** `public/js/game-core.js` chứa `BOARD_CONFIGS` và hàm quét 4 hướng quanh nước vừa đi; server import trực tiếp file này nên client và server không bao giờ lệch luật.
- **AI Khó chỉ hoàn hảo trên 3×3.** Bàn 3×3 dùng minimax đầy đủ nên không thể thua. Bàn 4×4–8×8 dùng iterative deepening + alpha-beta trong ngân sách ~800ms/lượt, giới hạn độ sâu (4×4 sâu hơn, 7×7–8×8 nông hơn) và chỉ xét các ô gần quân đã có; AI chơi tốt nhưng có thể bị đánh bại, đặc biệt trên bàn lớn.
- **Điểm lưu riêng theo cỡ bàn.** Mỗi cỡ bàn có bảng AI (3 độ khó) và 2 người riêng; dữ liệu kiểu cũ (không có cỡ bàn) được chuyển vào mục 3×3 khi tải lần đầu, không xóa dữ liệu.
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
5. **AI bàn lớn mạnh hơn** bằng transposition table, đánh giá threat-space hoặc WebAssembly để tăng độ sâu mà vẫn dưới 1 giây/lượt.

---

## Giấy phép

MIT. Không có tài sản của bên thứ ba ngoài font Google Fonts (theo giấy phép của Google Fonts).
