# Meo Meo Caro

Game cờ ca-rô (Tic Tac Toe) chủ đề mèo với bàn **3×3** và **bàn ∞ vô cực tự mở rộng**, chơi được theo ba cách:

- **Đấu với máy** — 3 độ khó, chọn cỡ bàn, chơi hoàn toàn offline sau lần tải đầu.
- **2 người cùng máy** — chung một thiết bị, chọn cỡ bàn rồi luân phiên đánh.
- **Online** — tạo phòng bằng mã 5 ký tự, chia sẻ link `?room=CODE`, máy chủ xác thực toàn bộ nước đi.

Có **tài khoản tùy chọn** (đăng ký / đăng nhập / hồ sơ) để lưu **lịch sử đấu online**, **thống kê theo cỡ bàn** và **xem lại ván** bằng chuỗi nước đi đã lưu. Khách vẫn chơi được mọi chế độ nhưng không có lịch sử. Cơ sở dữ liệu dùng **PostgreSQL** khi có `DATABASE_URL`, hoặc **SQLite** trong `data/meo.db` khi chạy local.

Toàn bộ hình mèo, quân cờ, icon và hiệu ứng là **SVG gốc vẽ tay bằng code**, không dùng hình ảnh ngoài và không dùng nhân vật có bản quyền. Âm thanh được tổng hợp bằng Web Audio (không có file mp3).

---

## Tính năng

| Nhóm | Chi tiết |
| --- | --- |
| Chế độ chơi | AI (Mèo con / Mèo trưởng thành / Mèo thông thái), 2 người cùng máy, online theo phòng |
| Cỡ bàn | 3×3 và **∞ vô cực**. Luật thắng: 3 quân (3×3), 5 quân (∞); chuỗi dài hơn vẫn thắng. Bàn ∞ dùng toạ độ nguyên (có số âm), vùng chơi ban đầu 9×9 quanh (0,0), tự mở rộng 2 ô quanh quân xa nhất và không bao giờ co lại; hòa khi chạm giới hạn kỹ thuật 2000 nước |
| AI | Dễ: phần lớn ngẫu nhiên, thỉnh thoảng thắng/chặn ngay; Vừa: thắng → chặn → ưu tiên giữa, ~20% ngẫu nhiên; Khó: minimax đầy đủ trên 3×3 nên không thể thua. Bàn ∞ dùng danh sách ô gần quân, iterative deepening sâu 3–4 trong Web Worker (~800ms), trả nước hợp lệ kể cả khi hết thời gian |
| Bàn cờ | Lưới 3×3 dựng động, quân là mặt mèo có biểu cảm thường/thắng/thua, đánh dấu nước vừa đi, đường thắng bằng sợi len nối đúng chuỗi thắng, confetti cá và dấu chân mèo. Bàn ∞ vẽ bằng Canvas có ảo hoá ô, kéo để di chuyển, cuộn/chụm để thu phóng, nút ± / về giữa / tới nước vừa đánh, mũi tên chỉ nước ngoài màn hình và hoạt ảnh mở rộng vùng |
| Giao diện | Tiếng Việt mặc định, chuyển sang tiếng Anh; font Baloo 2 + Nunito; tông kem/hồng/cam/xanh, viền mực dày kiểu sticker; bàn co giãn vuông, không tràn ngang trên màn 320px; bàn ∞ dùng `touch-action: none` để chạm/kéo/chụm không cuộn trang, có nhãn toạ độ, tổng số nước và thông báo cho trình đọc màn hình |
| Tài khoản | Đăng ký / đăng nhập / đăng xuất, ghi nhớ phiên, hồ sơ (tên hiển thị + avatar), đổi mật khẩu (thu hồi các phiên khác), xoá tài khoản mềm. Khi bật email: xác thực địa chỉ bằng link, quên/đặt lại mật khẩu bằng link dùng một lần, đổi email qua bước xác thực email mới, banner nhắc xác thực. Tên đăng nhập 3–20 ký tự `[a-zA-Z0-9_]`, không phân biệt hoa thường; mật khẩu 8–72 ký tự, chặn mật khẩu phổ biến và trùng tên đăng nhập; thanh độ mạnh mật khẩu; lỗi hiển thị theo mã đã dịch. Khách vẫn chơi AI / 2 người / online nhưng không lưu lịch sử |
| Lịch sử & thống kê | Chỉ lưu ván online có ít nhất một tài khoản; mỗi ván lưu một lần (thắng, hoà, chạm giới hạn nước, mất kết nối, rời phòng), đấu lại tạo bản ghi mới. Danh sách có phân trang (≤50), lọc theo cỡ bàn và kết quả; chi tiết chỉ người trong ván xem được (người ngoài nhận 404). Thống kê thắng/hoà/thua và tỷ lệ thắng theo từng cỡ bàn. Đối thủ đã xoá tài khoản hiển thị là "Người chơi đã xóa" |
| Xem lại ván | Trình phát lại chỉ đọc dùng lại bàn 3×3 hoặc Canvas ∞: nút đầu / trước / phát–tạm dừng / sau / cuối, thanh tua, tốc độ 0.5×–4×, bộ đếm nước, đánh dấu nước hiện tại và vẽ đường thắng ở nước cuối |
| Lời mời | Link `location.origin/?room=CODE`, sao chép và chia sẻ. Khách mở link được đưa tới đăng nhập/đăng ký hoặc "Chơi với tư cách khách" rồi tự vào phòng, giữ nguyên mã phòng. Tài khoản đã đăng nhập thấy hộp xác nhận cỡ bàn / luật / chủ phòng trước khi vào. Mã sai, phòng đầy hoặc đã đóng báo rõ và tự bỏ `?room` khỏi URL. Chờ server thức dậy 30–90 giây với thông báo trạng thái |
| Cài đặt | Bật/tắt âm thanh, nhạc nền, giảm chuyển động; tên người chơi ≤12 ký tự; 6 avatar mèo; ghi nhớ cỡ bàn đã chọn |
| Lưu trữ | localStorage: hồ sơ khách, cài đặt, bảng điểm **riêng theo từng cỡ bàn** (kể cả ∞) cho AI (3 độ khó) và 2 người; tự chuyển sang bộ nhớ tạm nếu trình duyệt chặn localStorage; dữ liệu 3×3 cũ được tự động chuyển sang mục 3×3. Tài khoản và lịch sử nằm ở database phía server |
| Online | Mã phòng tránh ký tự dễ nhầm (`0 O 1 I L`), người tạo chọn cỡ bàn (3×3 hoặc ∞), đồng hồ 30 giây/lượt (∞: 45 giây), tự đánh nước hợp lệ khi hết giờ, kết nối lại trong 60 giây, thay tab cũ bằng tab mới, 6 biểu cảm với cooldown 2 giây, đấu lại giữ nguyên cỡ bàn khi cả hai đồng ý. Bàn ∞ gửi `game:move` bằng `{x, y}`, máy chủ kiểm tra toạ độ nguyên, vùng chơi, ô trống, lượt và giới hạn 2000 nước. Phiên Socket.IO lấy danh tính từ cookie tài khoản, không tin tên client gửi. **Đi lại:** chế độ với máy hoàn tác ngay; online gửi yêu cầu cho đối thủ (15 giây, tối đa 3 lần/ván, cooldown 10 giây sau khi bị từ chối/hết giờ) |
| PWA | Manifest, icon 192/512, service worker cache app shell (gồm cả AI worker, module bàn ∞, `api.js` và `wake.js`, cache v9), không cache `/api/*`, `/socket.io/*` hay `/health`; cài lên màn hình chính, chơi AI khi mất mạng |
| Bảo mật | Máy chủ là nguồn sự thật, tự suy ra luật thắng từ cỡ bàn; làm sạch tên/avatar; giới hạn 10 sự kiện/giây/socket; tối đa 1000 phòng; không gửi `playerKey` cho đối thủ. Mật khẩu băm bằng `crypto.scrypt` (salt 16 byte, N=2¹⁵, r=8, p=1, keylen 64) và so sánh `timingSafeEqual`; token phiên 32 byte ngẫu nhiên, DB chỉ lưu SHA-256; token đặt lại/xác thực email cũng 32 byte, chỉ lưu SHA-256 và dùng một lần; link email luôn dựng từ `PUBLIC_URL`, token chỉ nằm trong URL fragment; cookie `mmc_sid` httpOnly, SameSite=Lax, Secure khi production; CSRF yêu cầu JSON + Origin/Host khớp; rate limit đăng ký/đăng nhập/quên mật khẩu/đổi email; Helmet + CSP + `Referrer-Policy: no-referrer`; SQL tham số hoá; không trả `password_hash`, `token_hash`, email đầy đủ của người khác hay `user_id` của người khác |

---

## Công nghệ

- HTML5, CSS3, JavaScript ES Modules thuần (không framework, không bước build).
- Node.js ≥ 22.13, Express 4, Socket.IO 4, helmet, compression, express-rate-limit.
- PostgreSQL qua `pg` (khi có `DATABASE_URL`) hoặc SQLite tích hợp `node:sqlite` (file `data/meo.db`).
- `crypto.scrypt` cho mật khẩu, SHA-256 cho token phiên; migration có phiên bản chạy tự động khi khởi động.
- Web Audio API tổng hợp âm thanh; Canvas cho confetti và bàn ∞.
- `socket.io-client` chỉ dùng cho test tích hợp; Playwright chỉ dùng trong QA thủ công, không phải dependency.

---

## Cấu trúc thư mục

```text
meo-meo-caro/
├── package.json
├── package-lock.json
├── server.js                 # Express + Socket.IO, nguồn sự thật của chế độ online
├── db.js                     # adapter PostgreSQL/SQLite, migration, query, transaction
├── auth.js                   # scrypt, phiên đăng nhập, API tài khoản, email/quên mật khẩu, CSRF
├── mailer.js                 # console/smtp/resend/test, mẫu thư VI/EN, link từ PUBLIC_URL
├── history.js                # lưu ván một lần, API lịch sử / chi tiết / thống kê
├── render.yaml               # blueprint Render: web service + PostgreSQL
├── .env.example              # mẫu biến môi trường (không chứa bí mật)
├── scripts/
│   ├── migrate.js            # `npm run migrate`
│   └── admin-reset-password.js # `npm run admin:reset-password -- <username>` (local)
├── README.md
├── public/
│   ├── index.html            # các màn hình game, tài khoản, hồ sơ, lịch sử, thống kê, dialog
│   ├── manifest.json         # PWA manifest
│   ├── sw.js                 # service worker: app shell + offline AI (cache v9)
│   ├── css/
│   │   └── style.css         # giao diện bàn 3×3, tài khoản/lịch sử/replay, responsive
│   ├── assets/
│   │   └── cats.js           # SVG gốc: 6 mèo, mascot, dấu chân, cá, len, chuông
│   ├── icons/
│   │   ├── icon.svg
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   └── js/
│       ├── main.js           # bộ điều khiển trung tâm (điều hướng, ván chơi, online,
│       │                     # tài khoản, lịch sử, replay, lời mời)
│       ├── api.js            # gọi REST /api, lỗi mã hoá, timeout
│       ├── wake.js           # thử lại khi server Render đang ngủ (backoff ~90 giây)
│       ├── game-core.js      # cấu hình cỡ bàn, bàn cờ, luật thắng/thua/hòa, bàn ∞
│       ├── ai.js             # AI 3 độ khó cho 3×3 và bàn ∞
│       ├── ai-worker.js      # Web Worker chạy AI bàn vô cực
│       ├── ai-client.js      # gọi worker, timeout/hủy, fallback main thread
│       ├── infinite-board.js # Canvas ảo hoá cho bàn ∞
│       ├── online.js         # bọc Socket.IO phía client
│       ├── ui.js             # render bàn 3×3, hiệu ứng, toast, timer, confetti
│       ├── audio.js          # âm thanh tổng hợp Web Audio
│       ├── storage.js        # localStorage an toàn + fallback bộ nhớ
│       └── i18n.js           # chuỗi tiếng Việt / tiếng Anh
└── test/
    ├── ai.test.mjs           # luật chơi 3×3 và ∞, AI các độ khó, duyệt cạn AI Khó
    ├── server.test.mjs       # Socket.IO thật: phòng, cỡ bàn 3×3 và ∞, tài khoản, rejoin
    ├── auth.test.mjs         # đăng ký/đăng nhập/phiên/CSRF/rate limit/xoá tài khoản/migration
    ├── history.test.mjs      # lưu ván, lịch sử, replay, thống kê, quyền truy cập
    ├── wake.test.mjs         # giữ đăng nhập khi lỗi mạng, backoff, offline, 4xx
    └── password-reset.test.mjs # email xác thực, quên/đặt lại mật khẩu, đổi email, rate limit
```

---

## Chạy dự án

Yêu cầu **Node.js ≥ 22.13** (dùng `node:sqlite` tích hợp). Nếu chỉ dùng PostgreSQL, Node ≥ 20 vẫn chạy được nhưng khuyến nghị giữ ≥ 22.13.

```bash
npm install
npm start
```

Mở `http://localhost:3000`. Lần chạy đầu tự tạo `data/meo.db` (SQLite) và chạy migration; không cần cấu hình gì thêm.

Chế độ phát triển (tự khởi động lại khi sửa server):

```bash
npm run dev
```

Chạy migration thủ công (idempotent, đã tự chạy khi `npm start`):

```bash
npm run migrate
```

Chạy test:

```bash
npm test            # ai + server + auth + history
```

> Các module ES yêu cầu chạy qua HTTP, không mở trực tiếp `public/index.html` bằng `file://`.

### Biến môi trường

Sao chép `.env.example` thành `.env` nếu muốn cấu hình. **Không commit `.env`.**

| Biến | Mặc định | Ý nghĩa |
| --- | --- | --- |
| `PORT` | `3000` | Cổng server |
| `DATABASE_URL` | (trống) | Chuỗi kết nối PostgreSQL, ví dụ `postgresql://user:pass@host/db?sslmode=require`. Khi có biến này, SQLite không được dùng |
| `DATABASE_FILE` | `data/meo.db` | Đường dẫn SQLite khi không có `DATABASE_URL`; test dùng file tạm riêng |
| `PGSSL` | (trống) | Đặt `true` để buộc SSL khi nhà cung cấp PostgreSQL yêu cầu (Neon/Supabase thường đã có `sslmode=require` trong URL) |
| `SESSION_SECRET` | (trống) | **Bắt buộc khi `NODE_ENV=production`**, chuỗi ngẫu nhiên ≥ 32 ký tự. Không dùng giá trị mẫu |
| `SESSION_DAYS` | `30` | Số ngày của phiên "ghi nhớ"; phiên không ghi nhớ luôn 7 ngày |
| `NODE_ENV` | (trống) | Đặt `production` để bật cookie `Secure`, kiểm tra `SESSION_SECRET` |
| `TRUST_PROXY` | (trống) | Số hop proxy tin cậy (Render đặt `1`) để `req.ip` và rate limit đúng sau proxy |
| `CORS_ORIGIN` | (trống) | Danh sách origin được phép, phân cách bằng dấu phẩy. Chỉ cần đặt khi client và server khác origin |
| `ROOM_TTL_MS` | `900000` | Thời gian phòng không hoạt động trước khi bị dọn (15 phút) |
| `RECONNECT_GRACE_MS` | `60000` | Thời gian giữ chỗ khi người chơi mất kết nối |
| `TURN_MS` | (trống) | Ghi đè thời gian mỗi lượt cho test. Khi để trống: 30 giây cho 3×3, 45 giây cho ∞ |
| `INFINITE_MAX_MOVES` | `2000` | Giới hạn kỹ thuật số nước của bàn ∞ trước khi hòa; chủ yếu dùng cho test |
| `UNDO_TIMEOUT_MS` | `15000` | Thời gian đối thủ trả lời yêu cầu đi lại online |
| `UNDO_COOLDOWN_MS` | `10000` | Thời gian chờ trước khi xin lại sau khi bị từ chối/hết giờ |
| `DISABLE_RATE_LIMIT` | (trống) | Chỉ dùng trong test (`1` để tắt rate limit) |

`ROOM_TTL_MS`, `RECONNECT_GRACE_MS`, `TURN_MS`, `INFINITE_MAX_MOVES`, `UNDO_TIMEOUT_MS`, `UNDO_COOLDOWN_MS` và `DISABLE_RATE_LIMIT` chủ yếu dùng cho test; khi chạy thật không cần đặt.

> **Không bao giờ ghi mật khẩu, token hay chuỗi kết nối database vào log, repo hoặc response.** Server chỉ log mã lỗi và mã phòng; API không trả `password_hash`, `token_hash` hay cookie của người khác.

---

## Tài khoản, lịch sử & xem lại

### Tài khoản

- Đăng ký bằng tên đăng nhập (3–20 ký tự `[a-zA-Z0-9_]`, lưu dạng chữ thường và không phân biệt hoa thường), tên hiển thị ≤ 12 ký tự, mật khẩu 8–72 ký tự và avatar mèo.
- Đăng nhập có lựa chọn **Ghi nhớ đăng nhập**: có ghi nhớ dùng `SESSION_DAYS` (mặc định 30 ngày), không ghi nhớ dùng phiên 7 ngày. Cookie `mmc_sid` là httpOnly, SameSite=Lax, Secure khi production.
- Hồ sơ cho phép đổi tên hiển thị/avatar và đổi mật khẩu. Đổi mật khẩu **giữ phiên hiện tại** nhưng thu hồi mọi phiên khác.
- Xoá tài khoản là xoá mềm: username/display_name được ẩn danh, mọi phiên bị xoá, nhưng lịch sử ván vẫn còn và hiển thị đối thủ là "Người chơi đã xóa". Không thể khôi phục sau khi xoá.
- Khách không cần tài khoản: vẫn chơi AI, 2 người cùng máy và online. Khách **không** có lịch sử/thống kê. Khi một ván có một tài khoản và một khách, ván được lưu cho tài khoản kèm ảnh chụp tên/avatar của khách.
- Mỗi tài khoản chỉ được giữ **một ghế** trong một phòng. Mở tab thứ hai cùng tài khoản sẽ thay thế socket cũ (rejoin) chứ không tạo người chơi thứ ba.

### Lịch sử & thống kê

- Ván online kết thúc do thắng, hoà, chạm giới hạn nước, mất kết nối quá hạn hoặc rời phòng đều được lưu **đúng một lần**. Lỗi database chỉ ghi log, không làm sập server hay treo phòng.
- Danh sách lịch sử có phân trang (`page`, `limit` ≤ 50), lọc theo cỡ bàn (3×3 hoặc ∞) và kết quả thắng/thua/hoà; bấm **Xem lại** để mở ván.
- Chi tiết ván chỉ trả cho người trong ván. Người khác nhận `404 MATCH_NOT_FOUND` (không tiết lộ ván có tồn tại); chưa đăng nhập nhận `401 AUTH_REQUIRED`.
- Trang thống kê tổng hợp số ván, thắng/hoà/thua, tỷ lệ thắng và bảng theo từng cỡ bàn.

### Xem lại ván

Trình phát lại chỉ đọc dựng lại bàn từ danh sách nước đi đã lưu (chỉ số ô với bàn 3×3, toạ độ `{x,y}` với bàn ∞). Có nút **đầu / trước / phát–tạm dừng / sau / cuối**, thanh tua, tốc độ 0.5×/1×/2×/4×, bộ đếm `n/tổng`, đánh dấu nước hiện tại và vẽ đường thắng khi tới nước cuối. Bàn ∞ dùng lại Canvas kéo/chụm; bàn 3×3 dùng lại lưới.

---

## Chơi online

1. Mở `http://localhost:3000`. Có thể đăng nhập/đăng ký hoặc bấm **Chơi với tư cách khách**. Tài khoản dùng tên hiển thị/avatar trong hồ sơ; khách nhập tên riêng (≤ 12 ký tự).
2. Chọn **Chơi online** → chọn cỡ bàn (kể cả **∞**) → **Tạo phòng**. Nhận mã 5 ký tự; cỡ bàn và luật thắng hiển thị ở phòng chờ.
3. Gửi mã hoặc bấm **Sao chép link** / **Chia sẻ** cho người thứ hai.
4. Người thứ hai mở link (hoặc nhập mã ở mục **Vào phòng**). Họ thấy đúng cỡ bàn của phòng; ai đi trước được chọn ngẫu nhiên.
5. Mỗi lượt có 30 giây (∞: 45 giây); hết giờ máy chủ tự đánh một ô trống ngẫu nhiên, không xử thua, và phát sự kiện `game:timeout`.
6. Kết thúc ván, cả hai có thể bấm **Đấu lại**; chỉ khi cả hai đồng ý ván mới bắt đầu, giữ nguyên cỡ bàn và đổi người đi trước.
7. Với bàn ∞, mỗi nước gửi `game:move` dạng `{roomId, x, y}` (toạ độ nguyên, có thể âm). Máy chủ từ chối toạ độ không nguyên, ngoài vùng hiện tại, ô đã có quân, sai lượt hoặc ván đã kết thúc. F5 khôi phục toàn bộ danh sách nước đi và vùng chơi.

### Đi lại (Undo)

**Với máy:** nút **Đi lại** nằm cạnh nút chơi lại/về nhà. Bấm khi đến lượt bạn và đã có ít nhất một nước trong ván; hệ thống bỏ nước của bạn và nước máy vừa đáp (nếu có), trả lượt về bạn. Nút bị khoá kèm lý do khi chưa có nước, máy đang nghĩ hoặc ván đã kết thúc. Bàn ∞ tính lại vùng chơi từ các nước còn lại, không giật khung nhìn.

**Online:** bấm **Xin đi lại** để gửi yêu cầu. Đối thủ thấy hộp thoại kèm thanh đếm ngược 15 giây; **Đồng ý** hoặc **Từ chối** (Esc = từ chối, Enter không bao giờ là đồng ý). Người xin thấy băng "Đang chờ … trả lời" và có thể **Hủy xin**. Khi được đồng ý, cả hai bàn lùi về đúng vị trí trước nước gần nhất của người xin, xoá mọi nước sau đó; lượt trở về người xin, đồng hồ được cấp lại đủ 30 giây (∞: 45 giây), chuỗi thắng/kết quả/tổng nước được tính lại. Khi bị từ chối, người xin thấy bong bóng mèo lêu lêu đúng chuỗi **“lêu lêu không cho đi lại đâu”** (EN: **“Nyah-nyah! No take-backs for you!”**), bàn cờ không đổi. Hết 15 giây không trả lời thì báo trung tính “Đối thủ không trả lời.” (không phải lời từ chối).

Giới hạn: mỗi người tối đa **3 yêu cầu/ván** (tính cả bị từ chối, hết giờ và tự hủy; đấu lại đặt lại); sau khi bị từ chối/hết giờ có **cooldown 10 giây** và **không xin lại đúng thế cờ đó** (cùng số nước đã đi). Trong lúc chờ, cả hai bị khoá đánh và đồng hồ lượt tạm dừng; ngắt kết nối, rời phòng hoặc ván kết thúc sẽ hủy yêu cầu. F5 khi đang chờ: server hủy yêu cầu (coi như mất kết nối) và khôi phục bàn/lượt; vào lại nhanh bằng `playerKey` vẫn nhận được `room:state` kèm thông tin yêu cầu nếu socket cũ còn sống.

Lịch sử lưu **danh sách nước cuối cùng**: các nước đã hoàn tác không xuất hiện trong `matches.moves`, nên xem lại khớp bàn đã chơi; ván vẫn chỉ lưu một lần.

Sự kiện mới (chỉ thêm, không đổi tên sự kiện cũ):

| Chiều | Sự kiện | Dữ liệu |
| --- | --- | --- |
| C→S | `undo:request` | `{roomId, moveCount}` → ack `{ok, applied?}` |
| C→S | `undo:respond` | `{roomId, accept}` (boolean) |
| C→S | `undo:cancel` | `{roomId}` |
| S→C | `undo:requested` | `{fromSymbol, fromName, fromAvatar, moveCount, expiresAt}` |
| S→C | `undo:resolved` | `{result: "accepted"\|"declined"\|"timeout"\|"cancelled"\|"aborted", bySymbol?, fromSymbol?}` |

`room:state` bổ sung `undo` (yêu cầu đang chờ, hạn, ai xin) cùng `undoLeft`, `undoCooldownUntil`, `undoDeclinedHere`, `moveCount`, `youHaveMove`.

Mã lỗi đi lại: `UNDO_NOT_AVAILABLE`, `UNDO_NO_MOVES`, `UNDO_PENDING`, `UNDO_LIMIT_REACHED`, `UNDO_COOLDOWN`, `UNDO_ALREADY_DECLINED_HERE`, `OPPONENT_OFFLINE`, `STALE_STATE`. Giao diện dịch đủ VI/EN.

### Link mời

- Link có dạng `location.origin/?room=CODE` (ví dụ `https://ten-app.onrender.com/?room=ABC23`). Nút **Sao chép link** và **Chia sẻ** dùng chung một URL.
- **Khách chưa đăng nhập** mở link: app mở màn hình đăng nhập/đăng ký, ghi rõ đang được mời vào phòng. Sau khi đăng nhập/đăng ký hoặc bấm **Chơi với tư cách khách**, app tự mở hộp xác nhận phòng và vào đúng mã — không mất mã phòng.
- **Tài khoản đã đăng nhập** mở link: thấy hộp xác nhận gồm avatar/tên chủ phòng, cỡ bàn và luật thắng trước khi bấm **Vào ván**.
- Mã sai định dạng, phòng không tồn tại, phòng đầy hoặc đã đóng đều báo rõ; app tự xoá `?room` khỏi URL bằng `history.replaceState` và đưa về trang chủ để tránh mở lại lỗi.
- Host là `localhost`/IP nội bộ: hộp mời hiển thị lưu ý rằng người ở máy khác cần dùng URL công khai (tunnel/LAN) chứ không dùng `localhost`.
- Khi server đang ngủ (Render free), app thử kết nối lại trong 30–90 giây, hiển thị "đang đánh thức server" và thông báo rõ nếu quá hạn.
- Tên/avatar hai bên lấy từ hồ sơ tài khoản (hoặc tên khách đã nhập). Server không tin tên client gửi khi socket có cookie hợp lệ.

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

## Email: xác thực và quên mật khẩu

Phần này là **tuỳ chọn**. Nếu không cấu hình `MAIL_PROVIDER`, server vẫn chạy bình thường, `GET /api/config` trả `mailEnabled:false`, ô email khi đăng ký là tuỳ chọn và các nút quên mật khẩu/đổi email bị ẩn. Không có đăng nhập bằng email; email chỉ dùng để xác thực và khôi phục mật khẩu.

### Cấu hình

| Biến | Ý nghĩa |
| --- | --- |
| `PUBLIC_URL` | URL công khai của app, ví dụ `https://meo-meo-caro.onrender.com`. Mọi link trong thư được dựng từ đây, **không** dùng `Host`/`Origin` của request. Production bắt buộc `https://`. |
| `MAIL_PROVIDER` | `console` (in thư ra terminal), `smtp`, `resend` hoặc `test` (chỉ dùng trong test, production tự tắt). |
| `MAIL_FROM` | Địa chỉ gửi, ví dụ `Meo Meo Caro <no-reply@domain.com>`. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS` | Dùng khi `MAIL_PROVIDER=smtp`. Cổng 587 dùng `SMTP_SECURE=false` + STARTTLS; cổng 465 dùng `SMTP_SECURE=true`. |
| `RESEND_API_KEY` | Dùng khi `MAIL_PROVIDER=resend`. |
| `RESET_TOKEN_MINUTES` | Hạn link đặt lại mật khẩu, mặc định 30 phút. |
| `VERIFY_TOKEN_HOURS` | Hạn link xác thực email, mặc định 24 giờ. |

Nếu production đặt `MAIL_PROVIDER=console`/`test`, thiếu `PUBLIC_URL` https hoặc thiếu cấu hình provider, server **vẫn khởi động** nhưng ghi cảnh báo lúc khởi động và tự tắt email (`mailEnabled:false`) thay vì gửi thư lỗi.

### Chọn nhà cung cấp

- **Local (không gửi thư thật):** `MAIL_PROVIDER=console`, `PUBLIC_URL=http://localhost:3000`. Mở terminal sau khi bấm quên mật khẩu để lấy link. Không dùng chế độ này ở production.
- **Gmail:** bật xác thực 2 bước, tạo **App Password** 16 ký tự, đặt `MAIL_PROVIDER=smtp`, `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER=<gmail>`, `SMTP_PASS=<app password>`, `MAIL_FROM` trùng địa chỉ Gmail. Gmail giới hạn số thư/ngày, phù hợp thử nghiệm.
- **Brevo:** tạo SMTP key trong Brevo, `SMTP_HOST=smtp-relay.brevo.com`, `SMTP_PORT=587`, `SMTP_SECURE=false`, `SMTP_USER` là email đăng nhập Brevo, `SMTP_PASS` là SMTP key. Cần xác minh domain hoặc địa chỉ gửi trong Brevo.
- **Resend:** xác minh domain ở Resend rồi đặt `MAIL_PROVIDER=resend`, `RESEND_API_KEY=...`, `MAIL_FROM` thuộc domain đã xác minh. Chưa xác minh domain thì chỉ gửi được tới địa chỉ chủ tài khoản.
- **Render:** đặt các biến trên ở **Environment** (secret cho `SMTP_PASS`, `RESEND_API_KEY`; không commit). `render.yaml` khai báo sẵn tên biến với `sync: false`; `MAIL_PROVIDER` mặc định `console` nên phải đổi sang `smtp`/`resend` sau khi cấu hình.

### Luồng hoạt động

1. **Đăng ký:** nếu email bật, email là bắt buộc. Server gửi link `PUBLIC_URL/#verify=TOKEN`; tài khoản dùng được ngay nhưng hiện banner nhắc xác thực (bỏ qua được 7 ngày). Email chưa xác thực **không** nhận thư đặt lại mật khẩu.
2. **Quên mật khẩu:** luôn trả `{ok:true}` dù email tồn tại hay không. Chỉ tài khoản có email **đã xác thực** mới nhận thư. Yêu cầu mới vô hiệu hoá token cũ. Link mở màn hình `#reset=TOKEN`, kiểm tra token trước khi cho nhập mật khẩu mới; đặt lại thành công thu hồi mọi phiên và gửi thư thông báo.
3. **Đổi email trong hồ sơ:** cần mật khẩu hiện tại. Email mới nằm ở `pending_email`; email cũ vẫn dùng để đăng nhập/khôi phục cho tới khi bấm link xác thực email mới. Email cũ nhận thư thông báo. Không thể đặt email đã được tài khoản khác xác thực (`EMAIL_TAKEN`).
4. **Token:** 32 byte ngẫu nhiên base64url, DB chỉ lưu SHA-256, dùng một lần trong transaction, hết hạn theo cấu hình. Token không bao giờ xuất hiện trong log/API; sau khi đọc `#reset=`/`#verify=` client xoá ngay khỏi thanh địa chỉ bằng `history.replaceState`.
5. **Server đang ngủ:** các màn hình reset/verify và `/api/auth/me` tự thử lại với backoff tăng dần tới ~90 giây, hiện thông báo "đang đánh thức server". Lỗi mạng/timeout **không** đăng xuất người dùng; chỉ khi server trả `401` hoặc `{user:null}` mới chuyển về khách. Khi trình duyệt báo offline, app không chờ mà hiện thông báo thân thiện.

### Tài khoản chưa có email xác thực

Tài khoản cũ (hoặc đăng ký khi chưa bật email) không thể tự dùng quên mật khẩu. Trên máy chủ, chạy lệnh cục bộ sau để in một link đặt lại (không gọi API, không gửi thư):

```bash
npm run admin:reset-password -- <username>
```

Lệnh chỉ in link ra terminal; không ghi token vào log ứng dụng. Chỉ chạy trên máy bạn tin cậy.

---

## Triển khai

### Render + PostgreSQL (Neon hoặc Supabase)

1. Tạo database PostgreSQL miễn phí tại [Neon](https://neon.tech) hoặc [Supabase](https://supabase.com), lấy chuỗi kết nối dạng `postgresql://...` (Neon/Supabase thường kèm `?sslmode=require`).
2. Đưa mã nguồn lên GitHub.
3. Render → **New → Blueprint**, chọn repo (đọc `render.yaml`) hoặc tạo **Web Service** thủ công.
   - Runtime: **Node**. Build: `npm install`. Start: `npm start`. Health check: `/health`.
   - Node version ≥ 22.13 (đặt `NODE_VERSION=22.13.0` nếu Render chọn bản cũ).
4. Biến môi trường trên Render:
   - `DATABASE_URL` = chuỗi kết nối PostgreSQL (đặt ở Render Environment, **không commit**).
   - `SESSION_SECRET` = chuỗi ngẫu nhiên ≥ 32 ký tự (`render.yaml` dùng `generateValue: true`).
   - `NODE_ENV=production`, `TRUST_PROXY=1`, `PGSSL=true` nếu nhà cung cấp yêu cầu SSL.
   - `PUBLIC_URL=https://<ten-app>.onrender.com` (bắt buộc https) và cấu hình email: `MAIL_PROVIDER=smtp|resend`, `MAIL_FROM`, các biến `SMTP_*` hoặc `RESEND_API_KEY`. Xem mục **Email** ở trên.
5. Deploy. Migration tự chạy khi server khởi động; có thể chạy lại bằng `npm run migrate` trong Render Shell.
6. Mở URL Render, kiểm tra `/health` trả `{"status":"ok"}`, sau đó thử đăng ký và một ván online giữa hai trình duyệt.

`render.yaml` trong repo khai báo web service, health check, `SESSION_SECRET` tự sinh, một PostgreSQL free (nếu dùng Blueprint) và tên các biến email (`sync: false` để bạn tự nhập). Nếu dùng Neon/Supabase bên ngoài, xoá khối `databases` trong `render.yaml` và dán `DATABASE_URL` thủ công.

### Railway

1. Railway → **New Project → Deploy from GitHub repo**.
2. Thêm plugin PostgreSQL, gán `DATABASE_URL` từ plugin vào service.
3. Nixpacks tự nhận Node và chạy `npm start`; đặt `NODE_ENV=production`, `SESSION_SECRET`, `TRUST_PROXY=1`.
4. Health check `/health` nếu muốn.

### SQLite trên môi trường deploy

Nếu không đặt `DATABASE_URL`, server dùng SQLite tại `data/meo.db`. Trên Render/Railway, **filesystem thường là tạm thời**: mỗi lần deploy/restart có thể xoá `data/meo.db`, làm mất tài khoản và lịch sử. Chỉ dùng SQLite khi:

- chạy local/LAN, hoặc
- gắn **persistent disk** và đặt `DATABASE_FILE` trỏ vào thư mục được mount (ví dụ `/var/data/meo.db`).

Với production thật, nên dùng PostgreSQL qua `DATABASE_URL`.

### Lưu ý khi vận hành

- **Phòng đang chơi nằm trong RAM**: khởi động lại hoặc deploy phiên bản mới sẽ xoá các phòng đang chơi (client nhận `room:closed` và về trang chủ). Tài khoản, lịch sử, thống kê nằm trong database nên **không mất**.
- Ứng dụng chỉ chạy tốt với **một instance**. Muốn mở rộng ngang, cần Redis adapter cho Socket.IO và nơi lưu trạng thái phòng dùng chung (xem mục nâng cấp).
- WebSocket phải được proxy hỗ trợ. Render/Railway mặc định đã hỗ trợ; với nginx, thêm header `Upgrade`/`Connection`.
- Rate limit dựa trên `req.ip`; sau proxy phải đặt `TRUST_PROXY` đúng số hop, nếu không mọi người có thể bị tính chung một IP.
- Phiên hết hạn và token email hết hạn được dọn mỗi giờ; xoá tài khoản thu hồi mọi phiên, xoá email và mọi token ngay lập tức, đồng thời ẩn danh tên người chơi trong ảnh chụp lịch sử.

### PWA

- Bản build phục vụ trên HTTPS (localhost cũng được) thì trình duyệt mới cho cài và cache.
- Sau lần tải đầu, app shell được cache; chọn chế độ AI hoặc 2 người vẫn chơi được khi offline. Chế độ online và tài khoản cần server.
- Service worker **không cache** `/api/*`, `/socket.io/*` hay `/health`, nên lịch sử và phiên đăng nhập luôn lấy dữ liệu mới.
- Khi sửa CSS/JS/ảnh, tăng `CACHE_NAME` trong `public/sw.js` (hiện tại `meo-meo-caro-v10`) để người dùng nhận bản mới. Cache v10 đã gồm `api.js`, `wake.js`, `game-core.js`, toàn bộ module bàn ∞/AI và giao diện đi lại; không có tệp cũ bị xoá.

---

## Kiểm thử tự động

```bash
npm test                  # 125 test: ai + wake + server + auth + history + email
npm run test:ai           # 37 test
npm run test:wake         # 8 test
npm run test:server       # 36 test
npm run test:auth         # 15 test
npm run test:history      # 8 test
npm run test:password-reset # 21 test
```

Mỗi bộ test server khởi động một tiến trình thật ở cổng ngẫu nhiên với **SQLite tạm riêng** (`mkdtemp`), không chạm vào `data/meo.db` và tự dọn sau khi chạy. Có thể kiểm tra PostgreSQL bằng cách chạy server với `DATABASE_URL` trỏ tới database test và lặp lại các kịch bản thủ công; bộ test tự động hiện chạy trên SQLite.

- `test/ai.test.mjs` (37 test): cấu hình bàn 3×3, thắng đủ 4 hướng ở góc/cạnh/giữa, chuỗi ngắn không thắng, không vòng từ cuối hàng sang đầu hàng, chuỗi dài hơn luật vẫn thắng, hòa, ưu tiên nước thắng cuối cùng, AI 3×3 (mở bàn, thắng, chặn, góc), **duyệt cạn AI Khó 3×3** (1164 thế kết thúc, 0 thua), AI mọi độ khó chỉ trả ô trống. Phần ∞ kiểm tra vùng 9×9/mở rộng không co, toạ độ âm và overline, hòa kỹ thuật, AI mở bàn (0,0), AI thắng/chặn và AI tự đánh nhau luôn hợp lệ. **Đi lại:** `undoTargetCount`/`applyUndo` cho 3×3 và ∞ (giữ 1 hoặc 2 nước, trả lượt, `lastMove`, chuỗi thắng/kết quả, tính lại `region`, người đi trước khác nhau, không có nước thì trả `null`), cùng mô phỏng 12 ván AI Khó 3×3 sau nhiều lần đi lại vẫn không thua.
- `test/server.test.mjs` (36 test): tạo/join phòng, làm sạch tên, không lộ `playerKey`, chặn sai lượt/ô đã đánh/chỉ số sai, thắng do server tính, đấu lại cần 2 phiếu, cooldown biểu cảm, phòng đầy/mã sai, ngắt kết nối rồi vào lại, tab mới thay tab cũ, rời phòng, xoá phòng chờ, hết giờ tự đánh, rate limit; **cỡ bàn 3×3** (nhận `3` và `"3"`, từ chối cỡ khác bằng `UNSUPPORTED_BOARD_SIZE`, luật 3 quân, hòa kín bàn, F5 giữ `size`/`board`/`lastMove`, timer 30s); **∞** (vùng thưa, từ chối toạ độ xấu/ngoài vùng/ô đã có, thắng toạ độ âm, F5 khôi phục nước + vùng, timer 45s, hòa `INFINITE_MAX_MOVES`); **tài khoản** (danh tính lấy từ cookie, không lộ `userId`, một tài khoản không chiếm hai ghế, khách vẫn vào phòng tài khoản bằng tên riêng); **đi lại online** (khoá đánh + dừng đồng hồ, chấp nhận lùi 2 nước và trả lượt, từ chối giữ bàn + cooldown + chặn đúng thế cờ, giới hạn 3 lần/ván kể cả tự hủy, từ chối khi chưa có nước/ván xong/đối thủ offline/người ngoài/tự trả lời, F5 khi đang chờ, ngắt kết nối hủy yêu cầu, timeout báo trung tính, lịch sử chỉ lưu danh sách nước cuối và chỉ một bản ghi).
- `test/auth.test.mjs` (15 test): cookie httpOnly/SameSite/Path/Max-Age, phiên 7 ngày khi không ghi nhớ, tên đăng nhập/mật khẩu yếu bị từ chối, trùng tên không phân biệt hoa thường, lỗi đăng nhập chung, CSRF thiếu Origin/nội dung không JSON, cập nhật hồ sơ, đổi mật khẩu thu hồi phiên khác nhưng giữ phiên hiện tại, phiên hết hạn bị xoá, đăng xuất, xoá tài khoản ẩn danh + thu hồi phiên, rate limit đăng nhập, migration chạy hai lần vẫn idempotent, production từ chối khởi động khi thiếu `SESSION_SECRET`.
- `test/wake.test.mjs` (8 test): lỗi mạng/5xx được thử lại với backoff 1.2s → 1.9s → 3.1s … tối đa 10s/lần và dừng sau ~90 giây; không thử lại khi offline hoặc khi server trả 4xx; `/api/auth/me` giữ nguyên người đang đăng nhập khi lỗi mạng, chỉ về khách khi `401` hoặc `{user:null}`.
- `test/password-reset.test.mjs` (21 test): `mailEnabled`/`no-store`, đăng ký + thư xác thực, DB chỉ lưu hash token, xác thực một lần, link dựng từ `PUBLIC_URL` (không theo Host giả), phản hồi quên mật khẩu luôn giống nhau cho email lạ/chưa xác thực/đã xoá, kiểm tra token, mật khẩu yếu, đặt lại mật khẩu + thu hồi phiên + thư thông báo, token cũ bị vô hiệu, hai request đồng thời chỉ một thắng, token hết hạn, chuẩn hoá email, trùng email chưa xác thực rồi `EMAIL_TAKEN`, đổi email giữ email cũ tới khi xác thực, resend vô hiệu token cũ, xoá tài khoản xoá email/token và ẩn danh tên trong `matches` (đối thủ vẫn xem lịch sử), không lộ token trong log/response, rate limit quên mật khẩu/resend, server không cấu hình mail vẫn chạy.
- `test/history.test.mjs` (8 test): khách với khách không lưu ván; ván một tài khoản + khách lưu ảnh chụp đối thủ; chi tiết replay có đủ nước/đường thắng và chỉ người trong ván xem được; phân trang/lọc cỡ bàn/lọc kết quả + thống kê; đấu lại tạo bản ghi mới; thắng rồi ngắt kết nối chỉ lưu một lần; đối thủ xoá tài khoản hiển thị ẩn danh; **ván 4×4–8×8 cũ vẫn nằm trong DB nhưng bị ẩn khỏi danh sách, chi tiết và thống kê**.

---

## Kịch bản kiểm thử thủ công

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
| 19 | Chọn cỡ bàn AI | Mở Đấu với máy, chọn lần lượt 3×3 và ∞ | Chỉ có đúng hai lựa chọn; nút được chọn nổi bật; dòng luật đổi giữa `3 quân` và `5 quân liền`; tải lại trang vẫn nhớ cỡ bàn cuối |
| 20 | AI Khó 3×3 | Chơi 5 ván 3×3 ở mức Mèo thông thái | Không thua ván nào; thường hòa hoặc thắng |
| 21 | Thắng 3×3 | Tạo thắng hàng ngang, hàng dọc, đường chéo | Sợi len nối đúng 3 quân, confetti, thẻ kết quả đúng người thắng, điểm +1 |
| 22 | Hòa 3×3 | Điền kín 9 ô không ai thắng | Thẻ "Hòa", điểm hòa +1, không vẽ sợi len |
| 23 | Online 3×3 | Hai cửa sổ tạo/join phòng 3×3, chơi hết ván, F5 giữa ván, đấu lại | Đồng hồ 30 giây; F5 khôi phục đúng bàn/nước cuối/lượt; đấu lại reset bàn và đổi người đi trước |
| 24 | Từ chối cỡ bàn cũ | Gửi `room:create` với `size` = 4, 5, 8, `"4"` hoặc `"Infinite"`; thử `GET /api/history?size=4` | Socket trả `UNSUPPORTED_BOARD_SIZE`; API trả `400 INVALID_SIZE`; UI không còn nút 4×4–8×8 |
| 25 | Lịch sử ẩn ván cũ | Dùng database có ván 4×4–8×8 từ phiên bản trước, mở Lịch sử và Thống kê | Ván cũ vẫn nằm trong DB nhưng không xuất hiện trong danh sách, chi tiết trả `404`, thống kê không cộng mục 4–8 |
| 26 | Bảng điểm theo cỡ bàn | Mở Bảng điểm, đổi bộ lọc 3×3 ↔ ∞ | Số liệu đổi theo cỡ bàn; nút xóa ghi rõ cỡ bàn; xóa ∞ không làm mất điểm 3×3 |
| 27 | 2 người cùng máy chọn ∞ | Chọn 2 người → ∞ → Bắt đầu | Bàn ∞ mở với ô (0,0) ở giữa; điểm 2 người lưu riêng cho ∞ |
| 28 | Online chọn ∞ | Người tạo chọn ∞, người kia vào bằng mã | Phòng chờ và màn chơi của cả hai đều ghi `∞ · 5 quân liên tiếp · tối đa 2000 nước`; đồng hồ 45 giây |
| 29 | Hết giờ bàn ∞ | Chạy `TURN_MS=2000 npm start`, chơi online ∞, không đánh | Sau ~2 giây máy chủ tự đánh ô trống hợp lệ, ván tiếp tục, không bị xử thua; khi chạy thật là 45 giây |
| 30 | ∞: F5 và đấu lại | Hai cửa sổ phòng ∞, đánh vài nước, F5, đấu lại | F5 khôi phục đủ nước, vùng, nước cuối và lượt; đấu lại reset bàn ∞ và đổi người đi trước |
| 31 | Bàn phím & i18n ∞ | Dùng Tab/mũi tên tới sát biên vùng; đổi sang English | Không lọt ra ngoài vùng; nhãn đọc đúng toạ độ; tên cỡ bàn, luật thắng, bộ lọc điểm đổi sang tiếng Anh |
| 32 | PWA nhận bản mới | Mở app bằng bản cũ, tải lại sau khi deploy | Service worker `meo-meo-caro-v9` xoá cache cũ, app shell và module AI/∞ mới được tải; `/api`, `/socket.io`, `/health` không bị cache |
| 33 | ∞: nhập môn & điều khiển | Chọn ∞, dùng phím mũi tên + Enter; kéo chuột; cuộn/chụm; bấm ±, về giữa, tới nước vừa đánh | Ô (0,0) ở giữa; con trỏ luôn hiện; kéo >6px không đặt quân; zoom trong khoảng 24–96px; nút về giữa/tới nước vừa đánh hoạt động; không lỗi console |
| 34 | ∞: vùng tự mở rộng | Đánh ra sát biên rồi ra ngoài vùng cũ | Vùng trắng mở thêm 2 ô quanh quân xa nhất có hoạt ảnh ~250ms, không co lại; ô ngoài vùng bị làm mờ và bấm vào chỉ nhấp nháy cảnh báo |
| 35 | ∞: thắng và overline | Tạo 5 quân ngang/dọc/chéo ở toạ độ âm; tạo chuỗi 6 quân | Thắng đúng, sợi len nối trọn chuỗi (kể cả >5), thẻ kết quả đúng người thắng, có thông báo cho trình đọc màn hình |
| 36 | ∞: mobile 320–360px | Thu cửa sổ về 320px, chơi ∞ | Không có thanh cuộn ngang; chạm đặt quân, kéo để pan, chụm để zoom mà không cuộn trang; chữ toạ độ/số nước không tràn |
| 37 | ∞: online, F5 và đấu lại | Tạo phòng ∞ với hai cửa sổ; đánh vài nước, F5, đấu lại | Hai bên thấy cùng toạ độ/thứ tự nước; F5 khôi phục đủ nước, vùng, nước cuối và lượt trong 60 giây; đấu lại reset bàn ∞ và đổi người đi trước |
| 38 | ∞: hòa kỹ thuật & bảng điểm | Chạy `INFINITE_MAX_MOVES=8 npm start`, chơi đủ 8 nước không ai thắng; mở Bảng điểm | Ván hòa với thông báo đạt giới hạn, bàn bị khóa; bảng điểm có mục **∞ Vô cực** riêng, không ảnh hưởng điểm 3×3 |
| 39 | Đăng ký & thanh tài khoản | Trang chủ → **Đăng ký**, nhập tên đăng nhập hợp lệ, tên hiển thị, mật khẩu mạnh; bấm 👁 để hiện mật khẩu | Tạo tài khoản thành công, thanh tài khoản hiện avatar/tên/@username; ô tên và avatar trang chủ bị khóa; tải lại trang vẫn đăng nhập |
| 40 | Đăng nhập / ghi nhớ / đăng xuất | Đăng xuất, đăng nhập lại với **Ghi nhớ** bật rồi tắt; kiểm tra cookie và hạn phiên | Bật ghi nhớ: phiên ~30 ngày; tắt: ~7 ngày. Đăng xuất xoá cookie và trở về trạng thái khách |
| 41 | Khách không có lịch sử | Chơi một ván online với tư cách khách, kết thúc; thử mở Lịch sử | Không có mục Lịch sử trên thanh tài khoản khách; nếu gọi `/api/history` nhận `401 AUTH_REQUIRED` |
| 42 | Ván tài khoản + khách | Tài khoản A tạo phòng, khách B vào và chơi hết ván; A mở Lịch sử | Có đúng một bản ghi cho A, đối thủ hiển thị tên/avatar của khách; khách không có bản ghi |
| 43 | Lịch sử: lọc & phân trang | Chơi ≥ 3 ván khác cỡ bàn, mở Lịch sử, đổi bộ lọc cỡ bàn/kết quả, bấm **Tải thêm** | Danh sách đúng bộ lọc, trang tăng dần, hết dữ liệu thì nút tải thêm ẩn; ngày giờ/cỡ bàn/số nước đúng |
| 44 | Xem lại đầy đủ | Mở một ván trong Lịch sử | Đầu/trước/sau/cuối đúng vị trí, thanh tua và bộ đếm `n/tổng` khớp, phát tự chạy và dừng được, đổi tốc độ 0.5×–4×, nước hiện tại được đánh dấu, tới cuối hiện đường thắng |
| 45 | Quyền xem ván | Đăng nhập tài khoản C không tham gia ván, gọi `/api/history/<id>` | Nhận `404 MATCH_NOT_FOUND`, không lộ nước đi; chưa đăng nhập nhận `401` |
| 46 | Đổi mật khẩu | Đăng nhập cùng tài khoản ở hai trình duyệt; đổi mật khẩu ở trình duyệt 1 | Trình duyệt 1 vẫn dùng được; trình duyệt 2 bị đăng xuất ở lần gọi API kế tiếp; mật khẩu cũ không đăng nhập được |
| 47 | Xoá tài khoản mềm | Mở Hồ sơ → Xoá tài khoản, nhập mật khẩu, xác nhận | Về trạng thái khách, mọi phiên bị thu hồi; đối thủ vẫn thấy ván cũ với tên "Người chơi đã xóa"; không đăng nhập lại được |
| 48 | Link mời khi chưa đăng nhập | Tạo phòng, mở link trong cửa sổ ẩn danh | Hiện đăng nhập/đăng ký kèm ghi chú được mời; sau khi đăng ký hoặc **Chơi với tư cách khách** tự mở hộp xác nhận đúng phòng, giữ `?room` cho tới khi vào |
| 49 | Link mời khi đã đăng nhập | Tài khoản B đã đăng nhập mở link phòng của A | Hộp xác nhận hiện avatar/tên chủ phòng, cỡ bàn, luật thắng; bấm **Vào ván** thì cả hai vào game với tên tài khoản |
| 50 | Link sai / đầy / đóng | Mở `?room=ZZZZZ`, link phòng đã đóng, phòng đủ 2 người | Báo rõ lỗi tương ứng, tự bỏ `?room` khỏi URL, có nút về trang chủ; không kẹt ở màn hình trống |
| 51 | Offline với tài khoản | Đăng nhập rồi chặn mạng, tải lại trang, chơi AI/2 người; mở thử Lịch sử | App vẫn vào trang chủ và chơi AI/2 người bình thường; Lịch sử báo lỗi mạng rõ ràng; khi có mạng lại thì tài khoản/lịch sử hoạt động |
| 52 | EN + 360px cho màn tài khoản | Đổi sang English, thu cửa sổ 360px, mở Đăng nhập/Hồ sơ/Lịch sử/Replay | Toàn bộ nhãn, lỗi, nút, bộ lọc, replay đổi tiếng Anh; không có thanh cuộn ngang; nút bấm được, bảng không tràn |
| 53 | Đăng ký có email | Bật mail, đăng ký kèm email, mở hộp thư (hoặc terminal `console`) | Nhận thư xác thực; bấm link mở màn xác thực; token biến mất khỏi thanh địa chỉ; hồ sơ hiện email đã che + huy hiệu đã xác thực |
| 54 | Banner xác thực | Đăng ký chưa bấm link, về trang chủ | Banner nhắc xác thực; bấm bỏ qua thì banner ẩn 7 ngày; bấm "Gửi lại" có cooldown 60 giây |
| 55 | Quên mật khẩu | Đăng xuất, bấm **Quên mật khẩu?**, nhập email đã xác thực | Luôn báo "nếu email tồn tại..."; nhận thư; link mở màn đặt lại, kiểm tra token trước, đếm ngược gửi lại 60 giây |
| 56 | Email lạ / chưa xác thực | Lặp lại với email không tồn tại và email chưa xác thực | Phản hồi và thời gian giống hệt, không nhận thư, không lộ tài khoản |
| 57 | Token dùng một lần và hết hạn | Đặt lại mật khẩu, mở lại link cũ; thử link quá hạn | Báo token không hợp lệ/hết hạn; không đổi được mật khẩu; phiên cũ bị thu hồi sau khi đổi thành công |
| 58 | Đổi email | Hồ sơ → nhập email mới + mật khẩu hiện tại | Email cũ vẫn hiển thị và vẫn nhận thư khôi phục; dòng "chờ xác thực" hiện email mới đã che; email cũ nhận thư thông báo; xác thực xong email mới thay thế |
| 59 | Server đang ngủ | Dừng server, tải lại app / mở link `#reset=` hoặc `#verify=` | Hiện "đang đánh thức server", thử lại tăng dần tới ~90 giây; không bị đăng xuất khi lỗi mạng; server trả `{user:null}` mới về khách |
| 60 | Xoá tài khoản và lịch sử | Chơi online có tài khoản, đối thủ mở lịch sử; xoá tài khoản | Cả hai phía thấy "Người chơi đã xóa"; không còn tên cũ trong DB; email/token bị xoá; không đăng nhập/khôi phục được |
| 61 | Đi lại với máy 3×3 | Đi 2 nước (máy đã đáp), bấm **Đi lại** | Bàn lùi 2 mèo, về lượt bạn, toast "Đã đi lại", điểm AI không đổi; nút khoá lại khi chưa có nước |
| 62 | Đi lại bàn ∞ | Chơi vài nước xa gốc, bấm **Đi lại** | Số nước giảm đúng 2, vùng chơi tính lại từ nước còn lại, khung nhìn không nhảy về gốc |
| 63 | Online: được đồng ý | A xin đi lại, B bấm **Đồng ý** | Cả hai bàn lùi đúng 2 nước, lượt về A, đồng hồ 30 giây chạy lại đủ, hai bên thấy "Đã đi lại" |
| 64 | Online: bị từ chối | A xin, B bấm **Từ chối** (hoặc Esc) | Bàn không đổi; A thấy bong bóng mèo lêu lêu đúng chuỗi **“lêu lêu không cho đi lại đâu”** (EN đúng chuỗi tiếng Anh); sau 10 giây nút báo "Thế cờ này đã bị từ chối rồi." |
| 65 | Online: hết giờ / hủy | A xin rồi để hết 15 giây; lặp lại rồi bấm **Hủy xin** | Hết giờ: A thấy "Đối thủ không trả lời." (không phải lời từ chối); hủy: B thấy "Đối thủ đã hủy xin đi lại.", hộp thoại đóng, bàn giữ nguyên |
| 66 | Online: Enter/Esc và 360px | Mở hộp thoại xin đi lại, bấm Enter rồi Esc; thu cửa sổ 360px | Enter không đồng ý và không đổi bàn; Esc = từ chối; hộp thoại + bong bóng không tràn ngang, chữ đọc được |
| 67 | Online: F5 khi đang xin | A xin đi lại rồi F5 | Server hủy yêu cầu, A vào lại đúng bàn, không kẹt hộp thoại/banner, vẫn đánh tiếp được; B thấy hộp thoại đóng |
| 68 | PWA offline + đi lại | Cài PWA, chơi online một lần cho cache, chặn mạng, tải lại, chơi AI rồi **Đi lại** | Trang và module tải từ cache v10, AI 3×3 chạy và đi lại được khi offline, không lỗi console |

Thử thêm: chọn ∞ rồi bật Giảm chuyển động → không nhấp nháy viền nước đi/confetti; xóa localStorage rồi tải lại → bảng điểm về 0 nhưng app vẫn chạy; chặn localStorage → app dùng bộ nhớ tạm; nhập mã `ABC` → báo mã không hợp lệ; mã 5 ký tự không tồn tại → báo không tìm thấy phòng; người thứ ba vào phòng đủ 2 người → báo phòng đầy; người tạo phòng rời khi đang chờ → phòng bị xoá ngay.

---

## Quyết định thiết kế & giả định

- **Hết giờ = tự đánh ngẫu nhiên một ô trống.** Cách này giữ ván tiếp diễn, tránh treo phòng; máy chủ phát `game:timeout` để client hiển thị thông báo. Bàn 3×3 có 30 giây/lượt, bàn ∞ có 45 giây/lượt.
- **Server là nguồn sự thật.** Client chỉ gửi ý định: `game:move` với `{index}` cho bàn hữu hạn hoặc `{x, y}` cho bàn ∞. Server kiểm tra phòng, thành viên, trạng thái, lượt, toạ độ/vùng, ô trống rồi mới tính thắng/hòa và phát trạng thái. Server tự suy ra `winLength` từ `size`; client không thể gửi luật thắng riêng.
- **Bàn ∞ lưu thưa và mở rộng một chiều.** `game-core.js` giữ `INFINITE = { winLength: 5, initialHalf: 4, edgeMargin: 2, maxMoves: 2000 }`; quân nằm trong `Map` khoá `"x,y"` kèm mảng `moves` có thứ tự. Vùng chơi là hợp của khung ban đầu `[-4..4]²` và hộp bao các quân nới 2 ô, nên không bao giờ co lại; client và server cùng import file này để luật/vùng không lệch. Hòa chỉ xảy ra ở giới hạn kỹ thuật 2000 nước, không dựa trên diện tích vùng.
- **AI ∞ chỉ tính ô gần quân đã đánh.** Ứng viên là các ô trống trong vùng cách một quân ≤2 ô; nếu không có thì quét cả vùng. AI Khó chạy iterative deepening + alpha-beta sâu tối đa 4 trong Web Worker với ngân sách ~800ms/lượt và luôn trả về nước hợp lệ (best-so-far khi hết giờ). AI mạnh nhưng **không hoàn hảo** trên bàn ∞, đặc biệt khi chuỗi threat phức tạp.
- **Luật thắng dùng chung một file.** `public/js/game-core.js` chứa `BOARD_CONFIGS` và hàm quét 4 hướng quanh nước vừa đi; server import trực tiếp file này nên client và server không bao giờ lệch luật.
- **AI Khó hoàn hảo trên 3×3, AI ∞ mạnh nhưng không hoàn hảo.** Bàn 3×3 dùng minimax đầy đủ nên không thể thua. Bàn ∞ dùng iterative deepening + alpha-beta trong ngân sách ~800ms/lượt, chỉ xét các ô gần quân đã có trên `Map` thưa; AI chơi tốt nhưng có thể bị đánh bại khi chuỗi threat phức tạp.
- **Bàn ∞ không có "mép bàn".** Chuỗi thắng được quét trực tiếp trên toạ độ nguyên, nên chuỗi dài hơn 5 vẫn thắng và không bao giờ vòng từ hàng này sang hàng khác. Người chơi chỉ đánh được trong vùng hiện tại; vùng tự mở khi quân tiến ra xa.
- **Điểm lưu riêng theo cỡ bàn.** Mỗi cỡ bàn có bảng AI (3 độ khó) và 2 người riêng; dữ liệu kiểu cũ (không có cỡ bàn) được chuyển vào mục 3×3 khi tải lần đầu, không xóa dữ liệu.
- **`playerKey` chỉ dùng để vào lại phòng**, được trả trong ack tạo/join/rejoin và lưu sessionStorage; không bao giờ xuất hiện trong `room:state` gửi cho người khác. Khi socket có cookie hợp lệ, danh tính (tên/avatar/user_id) lấy từ database và bỏ qua tên client gửi.
- **Phòng vẫn nằm trong RAM; tài khoản/lịch sử nằm trong DB.** Cách này giữ nguyên mô hình phòng cũ (một instance, không cần Redis) nhưng vẫn lưu được kết quả lâu dài. Khởi động lại server làm rơi phòng đang chơi, không làm mất lịch sử đã ghi.
- **Một lớp SQL, hai adapter.** `db.js` viết SQL với placeholder `?`, adapter PostgreSQL đổi thành `$1..$n`; kiểu ID là TEXT (UUID), thời gian là epoch ms dạng BIGINT. Nhờ vậy cùng một bộ migration/query chạy trên SQLite và PostgreSQL; SQLite được tuần tự hoá bằng hàng đợi promise, PostgreSQL dùng transaction riêng của `pg`.
- **Lưu ván đúng một lần.** `finishRound` đặt cờ `matchSaved` trước khi ghi bất đồng bộ; thắng + ngắt kết nối gần như đồng thời không tạo hai bản ghi. Ghi `matches` và cộng `user_stats` trong **một transaction**; lỗi DB chỉ log, không ném ra ngoài.
- **Mật khẩu và phiên tách biệt.** Mật khẩu dùng scrypt với salt riêng từng người; token phiên là 32 byte ngẫu nhiên, chỉ SHA-256 của token được lưu. Đăng nhập sai luôn trả cùng một lỗi và vẫn chạy scrypt giả để giảm lộ thông tin thời gian. Đổi mật khẩu thu hồi các phiên khác; xoá tài khoản thu hồi tất cả.
- **Xoá tài khoản là xoá mềm.** Bản ghi `users` được giữ để lịch sử không mồ côi; username/display_name bị ẩn danh và API lịch sử trả "Người chơi đã xóa" cho cả hai phía, tránh lộ tên cũ.
- **Đi lại dựng lại bàn từ danh sách nước, không sửa từng ô.** `game-core.js` có `undoTargetCount`/`applyUndo` dùng chung; online cắt `moveLog` rồi dựng lại `board`/`cells`/`region`/`lastMove`/`winLine`/kết quả, giữ nguyên `first_player`. Không đổi schema DB: `matches.moves` lưu danh sách cuối cùng sau các lần đi lại. Trong lúc chờ đối thủ, server khoá `game:move`, dừng `turnDeadline` và cấp lại **đủ** thời gian lượt sau khi phân xử.
- **Không chat tự do.** Chỉ có biểu cảm giới hạn để tránh lạm dụng.
- **Email là tuỳ chọn, không phải đăng nhập.** Không có đăng nhập bằng email/OAuth. Email chỉ xác thực và khôi phục mật khẩu; khi chưa cấu hình mail, mọi tính năng cũ vẫn chạy và email đăng ký là tuỳ chọn. Link trong thư luôn dùng `PUBLIC_URL`, token chỉ nằm trong fragment và DB chỉ lưu SHA-256.
- **Đổi mật khẩu và xoá tài khoản vẫn cần mật khẩu hiện tại.** Quên mật khẩu dùng link email dùng một lần; tài khoản không có email đã xác thực được hỗ trợ bằng script cục bộ `npm run admin:reset-password`.
- **Lỗi mạng không đăng xuất.** `/api/auth/me` lỗi mạng/timeout được thử lại tới ~90 giây và giữ nguyên trạng thái đăng nhập; chỉ phản hồi rõ ràng `401`/`{user:null}` mới chuyển về khách.
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
| Server thoát ngay khi chạy production | Thiếu `SESSION_SECRET` hoặc ngắn hơn 32 ký tự | Đặt biến môi trường đủ mạnh; không dùng giá trị mẫu trong repo |
| Lỗi `SQLite tích hợp cần Node.js >= 22.13` | Node quá cũ | Nâng Node hoặc đặt `DATABASE_URL` cho PostgreSQL |
| Mất tài khoản sau khi deploy | Đang dùng SQLite trên filesystem tạm | Dùng PostgreSQL, hoặc gắn persistent disk và đặt `DATABASE_FILE` vào đó |
| Lỗi kết nối PostgreSQL/SSL | `DATABASE_URL` sai hoặc thiếu SSL | Kiểm tra chuỗi kết nối, thêm `?sslmode=require` hoặc `PGSSL=true` |
| Đăng nhập xong nhưng lần sau mất phiên | Cookie bị chặn, sai origin hoặc chạy production qua HTTP | Dùng HTTPS khi production; mở app và API cùng origin (hoặc đặt `CORS_ORIGIN` đúng) |
| `429 RATE_LIMITED` | Đăng ký/đăng nhập quá nhiều | Chờ theo `retryAfter`; kiểm tra `TRUST_PROXY` nếu đứng sau proxy để IP không bị gộp |
| Lịch sử trống | Đang chơi bằng khách, hoặc ván chưa kết thúc | Đăng nhập tài khoản trước khi chơi; lịch sử chỉ lưu ván online đã kết thúc và có ít nhất một tài khoản |
| Migration lỗi khi khởi động | Database mất kết nối hoặc tài khoản DB thiếu quyền tạo bảng | Chạy `npm run migrate` để xem lỗi; cấp quyền DDL cho user database |
| Không thấy nút quên mật khẩu/ô email | `mailEnabled:false` | Kiểm tra `GET /api/config`; xem cảnh báo `mail:` lúc khởi động; đặt `PUBLIC_URL` https + `MAIL_PROVIDER`/`MAIL_FROM` hợp lệ |
| Link trong thư trỏ sai domain | `PUBLIC_URL` sai hoặc thiếu | Link **không** lấy từ Host; đặt `PUBLIC_URL` đúng URL công khai rồi khởi động lại |
| Gửi thư lỗi 401/403 | Sai App Password/SMTP key hoặc `MAIL_FROM` không khớp tài khoản | Kiểm tra `SMTP_USER`/`SMTP_PASS`; Gmail cần App Password; Brevo/Resend cần xác minh người gửi/domain |
| Không nhận thư đặt lại | Email chưa xác thực hoặc bị rate limit | Xác thực email trước; thử lại sau 1 giờ; dùng `npm run admin:reset-password` nếu không có email |
| Thư vào spam | Người gửi/domain chưa xác minh | Xác minh domain (SPF/DKIM) ở nhà cung cấp; dùng `MAIL_FROM` cùng domain |
| Đang đăng nhập bỗng thành khách khi server ngủ | Bản cũ chưa có retry | Bản này giữ đăng nhập tới ~90 giây khi lỗi mạng; kiểm tra service worker đã nhận cache v9 |

---

## Hướng nâng cấp (tối đa 5)

1. **Redis adapter + lưu phòng** để chạy nhiều instance và không mất ván khi deploy.
2. **Tài khoản nhẹ và bảng xếp hạng tuần** dùng chung giữa các thiết bị.
3. **Chế độ khán giả / xem lại ván** bằng cách phát lại chuỗi nước đi đã lưu.
4. **Chat nhanh có kiểm duyệt** (câu mẫu, không nhập tự do) và lời mời kết bạn.
5. **AI bàn ∞ mạnh hơn** bằng transposition table, đánh giá threat-space hoặc WebAssembly để tăng độ sâu mà vẫn dưới 1 giây/lượt.

---

## Giấy phép

MIT. Không có tài sản của bên thứ ba ngoài font Google Fonts (theo giấy phép của Google Fonts).
