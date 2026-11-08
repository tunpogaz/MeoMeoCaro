# Meo Meo Caro — Tính năng hiện có

Tài liệu này dành cho cả người không đọc code: mô tả game đang làm được gì, dữ liệu nào được lưu, các "cổng" kỹ thuật giữa trình duyệt và máy chủ, và những giới hạn cần biết. Cập nhật lần đầu: 2026-11-08.

## Mục lục

1. [Cách chơi và các chế độ](#1-cách-chơi-và-các-chế-độ)
2. [Màn hình trong ứng dụng](#2-màn-hình-trong-ứng-dụng)
3. [Bàn 3×3 và bàn vô cực](#3-bàn-33-và-bàn-vô-cực)
4. [Chơi online](#4-chơi-online)
5. [Tài khoản và email](#5-tài-khoản-và-email)
6. [Lịch sử, xem lại và thống kê](#6-lịch-sử-xem-lại-và-thống-kê)
7. [Các tiện ích khác](#7-các-tiện-ích-khác)
8. [Sự kiện Socket.IO](#8-sự-kiện-socketio)
9. [API HTTP](#9-api-http)
10. [Cơ sở dữ liệu](#10-cơ-sở-dữ-liệu)
11. [Biến môi trường](#11-biến-môi-trường)
12. [Giới hạn đã biết](#12-giới-hạn-đã-biết)

## 1. Cách chơi và các chế độ

Meo Meo Caro là cờ ca-rô (tic-tac-toe) chủ đề mèo, chơi được trên điện thoại lẫn máy tính.

- **Chơi với máy:** chọn cỡ bàn, độ khó **Dễ / Vừa / Khó**, và ai đi trước (**Bạn / Máy / Ngẫu nhiên**). AI chạy trong Web Worker nên giao diện không bị đứng.
- **Hai người cùng máy:** hai người thay phiên chạm trên cùng một màn hình. Không cần tài khoản, không lưu lịch sử.
- **Chơi online:** tạo phòng, nhận **mã 5 ký tự** (bỏ các ký tự dễ nhầm 0/O/1/I/L) hoặc gửi **link mời**. Hai người chơi real-time qua Socket.IO. Có đồng hồ lượt, đấu lại, emote, vào lại sau khi F5.
- **Khách vẫn chơi được.** Đăng nhập chỉ cần khi muốn lưu lịch sử, xem thống kê hoặc dùng link mời xuyên thiết bị.
- **Đi lại:** với máy thì hoàn tác ngay; online thì gửi yêu cầu để đối thủ đồng ý/từ chối trong 15 giây. Chi tiết ở mục 4.

Luật cơ bản:

- Bàn **3×3**: ai có **3 quân liên tiếp** (ngang, dọc, chéo) thắng; hết ô mà không ai thắng là hòa.
- Bàn **vô cực**: ai có **5 quân liên tiếp** thắng; bàn mở rộng dần, không giới hạn 3×3.
- Không có luật "chặn hai đầu" đặc biệt; chuỗi 5 quân trở lên đều thắng.

## 2. Màn hình trong ứng dụng

| Màn hình | Người dùng thấy gì |
| --- | --- |
| Trang chủ | Tên hiển thị, 6 avatar mèo, các nút chơi với máy / 2 người / online, Cài đặt, Hướng dẫn, Bảng điểm; đăng nhập/đăng ký nếu là khách |
| Chuẩn bị chơi với máy | Chọn 3×3 hoặc vô cực, độ khó, người đi trước |
| Chuẩn bị 2 người | Chọn 3×3 hoặc vô cực |
| Phòng chờ online | Tạo phòng, nhập mã, xem link mời, cảnh báo nếu link là localhost |
| Bàn chơi | Bàn cờ, tên/avatar hai bên, điểm, đồng hồ lượt, nút emote, đấu lại, về nhà; nút **Đi lại** (với máy) / **Xin đi lại** (online), băng chờ và hộp thoại đồng ý/từ chối |
| Cài đặt | Ngôn ngữ VI/EN, âm thanh bật/tắt, hiệu ứng |
| Hướng dẫn | Luật chơi, mẹo, giải thích các nút |
| Bảng điểm | Điểm thắng/thua/hòa cục bộ theo cỡ bàn |
| Tài khoản | Đăng nhập, đăng ký, hồ sơ, đổi mật khẩu, đổi email, xác thực email, xoá tài khoản |
| Quên / đặt lại mật khẩu | Nhập email, nhận link, đặt mật khẩu mới |
| Lịch sử | Danh sách ván đã chơi, lọc theo cỡ bàn, phân trang |
| Xem lại | Phát lại từng nước, tua, tự động phát |
| Thống kê | Số ván, thắng/thua/hòa theo cỡ bàn |

Toàn bộ giao diện có tiếng Việt và tiếng Anh, bố cục responsive từ 320px, có PWA để cài lên màn hình chính và chơi offline với máy.

## 3. Bàn 3×3 và bàn vô cực

**3×3**

- 9 ô, lưu chỉ số ô 0–8.
- Máy chủ kiểm tra lượt, ô trống, toạ độ trước khi nhận nước.
- Đồng hồ mỗi lượt 30 giây; hết giờ thì tự đánh ô trống đầu tiên.

**Vô cực**

- Bàn bắt đầu vùng 9×9, mỗi nước hợp lệ có thể mở rộng vùng thêm 2 ô quanh quân vừa đặt. Khi đi lại, vùng được tính lại từ các nước còn lại nên có thể co về (không nhỏ hơn khung 9×9 ban đầu).
- Toạ độ là `{x, y}` nguyên, có thể âm; không có hiệu ứng "vòng qua mép bàn".
- Kéo để di chuyển, zoom, nút căn giữa và quay lại nước cuối.
- Giới hạn **2000 nước** mỗi ván; chạm giới hạn thì ván kết thúc hòa kỹ thuật.
- Đồng hồ mỗi lượt 45 giây.

## 4. Chơi online

- Tạo phòng: chọn cỡ bàn, nhận mã, chia sẻ mã hoặc link.
- Vào phòng bằng mã hoặc link; link mời được giữ lại nếu người chơi phải đăng ký trước.
- Mỗi tài khoản chỉ ngồi một ghế; mở tab thứ hai sẽ thay thế tab cũ.
- Máy chủ là nguồn sự thật: mọi nước đi được kiểm tra lại, client chỉ hiển thị.
- Đồng hồ lượt chạy trên máy chủ; mất kết nối tạm dừng đồng hồ.
- F5 hoặc mất mạng ngắn: vào lại bằng `playerKey` đã lưu, khôi phục đúng bàn.
- Mất kết nối quá **60 giây**: xử thua, phòng đóng sau thời gian chờ.
- Đấu lại: hai bên bỏ phiếu, điểm được cộng dồn trong phòng.
- Emote: các biểu cảm mèo gửi qua socket, có giới hạn tần suất.

### Đi lại (Undo)

- **Với máy:** nút **Đi lại** ở khu vực công cụ. Chỉ bấm được khi đến lượt bạn, đã có ít nhất một nước và máy không đang nghĩ/ván chưa kết thúc; nút khoá kèm lý do khi không hợp lệ. Hoàn tác bỏ nước của bạn + nước máy vừa đáp (nếu có), trả lượt về bạn, không đổi điểm. Đang chờ AI thì yêu cầu trước đó bị huỷ, kết quả AI đến muộn bị bỏ qua.
- **Online:** bấm **Xin đi lại** → đối thủ nhận hộp thoại “{tên} xin đi lại” với thanh đếm ngược 15 giây, chọn **Đồng ý** hoặc **Từ chối**. Enter không đồng ý; Esc = từ chối. Người xin thấy băng “Đang chờ … trả lời” + nút **Hủy xin**.
- **Khi được đồng ý:** cả hai bàn lùi về ngay trước nước gần nhất của người xin, xoá mọi nước sau đó; lượt về người xin; chuỗi thắng/kết quả/lastMove/tổng nước tính lại; `first_player` giữ nguyên. Đồng hồ được cấp lại đủ 30 giây (∞: 45 giây).
- **Khi bị từ chối:** bàn không đổi; người xin thấy bong bóng mèo lêu lêu với đúng chuỗi **“lêu lêu không cho đi lại đâu”** (EN: **“Nyah-nyah! No take-backs for you!”**), tự ẩn sau ~4 giây hoặc chạm để ẩn.
- **Hết 15 giây:** báo trung tính “Đối thủ không trả lời.” (không dùng chuỗi từ chối). Người xin hủy: đối thủ thấy “Đối thủ đã hủy xin đi lại.”
- **Giới hạn:** tối đa 3 yêu cầu/người/ván (tính cả bị từ chối, hết giờ, tự hủy; đấu lại đặt lại); sau khi bị từ chối/hết giờ có cooldown 10 giây và không xin lại đúng thế cờ đó (cùng số nước đã đi).
- **Trong lúc chờ:** cả hai không đánh được, đồng hồ lượt tạm dừng; ngắt kết nối/rời phòng/ván kết thúc sẽ hủy yêu cầu. F5 khi đang chờ khiến server hủy yêu cầu (tính là mất kết nối) và khôi phục bàn/lượt; nếu vào lại bằng `playerKey` khi socket cũ còn sống, `room:state` có kèm thông tin yêu cầu và thời gian còn lại.
- **Lịch sử:** chỉ lưu danh sách nước cuối cùng sau các lần đi lại; xem lại khớp bàn thực tế, ván vẫn lưu một lần.

## 5. Tài khoản và email

- Đăng ký bằng tên đăng nhập + mật khẩu; mật khẩu băm bằng **scrypt** (N=32768, r=8, p=1), không lưu mật khẩu gốc.
- Đăng nhập tạo session token; trình duyệt giữ cookie `mmc_sid` httpOnly, SameSite=Lax, Secure khi chạy HTTPS. DB chỉ lưu SHA-256 của token.
- Đăng xuất thu hồi session hiện tại.
- Hồ sơ: đổi tên hiển thị/avatar, đổi mật khẩu (cần mật khẩu hiện tại), đổi email (cần mật khẩu hiện tại).
- Xác thực email: gửi link có token dùng một lần, hạn 24 giờ.
- Quên mật khẩu: gửi link đặt lại, hạn 30 phút; phản hồi luôn giống nhau để không lộ email có tồn tại hay không.
- Xoá tài khoản: xoá mềm, huỷ session/token, ẩn danh tên trong lịch sử đấu với người khác.
- Chống lạm dụng: rate limit theo IP và theo tài khoản, CSRF kiểm tra JSON + Origin/Host, helmet, giới hạn kích thước JSON 10KB.

## 6. Lịch sử, xem lại và thống kê

- Ván online giữa hai tài khoản (hoặc một tài khoản với khách) được lưu **một lần** khi kết thúc.
- Lưu: cỡ bàn, luật thắng, tên/avatar hai bên, người đi trước, kết quả, lý do kết thúc, chuỗi thắng, danh sách nước đi, tổng số nước, thời gian bắt đầu/kết thúc.
- Nếu có đi lại, `moves` chỉ chứa các nước cuối cùng (nước bị hoàn tác không được lưu); xem lại khớp đúng bàn đã chơi và ván vẫn chỉ có một bản ghi.
- Lịch sử có phân trang và lọc theo cỡ bàn; chỉ người trong ván mới xem được chi tiết.
- Xem lại phát lại đúng danh sách nước đi đã lưu, có tua và tự động phát.
- Thống kê gộp thắng/thua/hòa theo cỡ bàn.
- Khách đấu khách không được lưu.
- Bảng điểm cục bộ (localStorage) dành cho chế độ chơi với máy / hai người cùng máy.

## 7. Các tiện ích khác

- **VI/EN:** mọi chuỗi giao diện có hai ngôn ngữ, đổi ngay không tải lại.
- **Âm thanh:** Web Audio tổng hợp, chỉ tạo context sau tương tác đầu tiên; có tắt/bật.
- **PWA:** service worker cache app shell, chơi offline với máy; không cache API, socket, health.
- **Responsive:** kiểm tra 320–360px không tràn ngang.
- **Trợ năng:** nút có nhãn, bàn cờ dùng nút thật, thông báo `aria-live`, tôn trọng `prefers-reduced-motion`.
- **Đánh thức server:** khi hosting free ngủ, client thử lại tới ~90 giây và hiện banner thay vì đăng xuất oan.

## 8. Sự kiện Socket.IO

Máy chủ lắng nghe (client → server):

| Sự kiện | Dữ liệu | Mục đích |
| --- | --- | --- |
| `room:create` | `{name?, avatar?, size}` | Tạo phòng, trả mã phòng và `playerKey` |
| `room:info` | `{roomId}` | Xem thông tin phòng trước khi vào |
| `room:join` | `{roomId, name?, avatar?}` | Vào phòng |
| `room:rejoin` | `{roomId, playerKey}` | Vào lại sau F5/mất mạng |
| `game:move` | `{roomId, index}` hoặc `{roomId, x, y}` | Đánh một nước |
| `game:rematch` | `{roomId}` | Bỏ phiếu đấu lại |
| `emote:send` | `{roomId, emote}` | Gửi emote |
| `room:leave` | `{roomId}` | Rời phòng |
| `undo:request` | `{roomId, moveCount}` | Xin đi lại (online) |
| `undo:respond` | `{roomId, accept}` | Đồng ý/từ chối yêu cầu |
| `undo:cancel` | `{roomId}` | Người xin tự hủy |

Máy chủ gửi (server → client):

| Sự kiện | Dữ liệu chính | Khi nào |
| --- | --- | --- |
| `room:state` | bàn, lượt, trạng thái, điểm, đồng hồ, người chơi | Sau mỗi thay đổi quan trọng |
| `game:over` | người thắng, lý do, chuỗi thắng | Ván kết thúc |
| `game:restart` | trạng thái ván mới | Đấu lại |
| `game:timeout` | ai bị hết giờ | Hết đồng hồ |
| `emote:received` | người gửi, emote | Có emote |
| `room:opponent-disconnected` | tên, thời gian chờ | Đối thủ mất kết nối |
| `room:opponent-reconnected` | tên | Đối thủ vào lại |
| `room:closed` | lý do | Phòng đóng |
| `room:replaced` | — | Tài khoản mở tab khác |
| `error:message` | mã lỗi, thông điệp | Lỗi chung |
| `undo:requested` | người xin, tên/avatar, số nước, hạn | Có yêu cầu đi lại |
| `undo:resolved` | `accepted` / `declined` / `timeout` / `cancelled` / `aborted` | Yêu cầu đi lại kết thúc |

`room:state` bổ sung `moveCount`, `youHaveMove`, `undoLeft`, `undoCooldownUntil`, `undoDeclinedHere` và `undo` (yêu cầu đang chờ: ai xin, số nước, hạn, còn lại bao lâu, có phải của bạn không).

Mọi phản hồi có `ack` dạng `{ok: true, ...}` hoặc `{ok: false, code, message}`.

Mã lỗi đi lại (client dịch VI/EN): `UNDO_NOT_AVAILABLE`, `UNDO_NO_MOVES`, `UNDO_PENDING`, `UNDO_LIMIT_REACHED`, `UNDO_COOLDOWN`, `UNDO_ALREADY_DECLINED_HERE`, `OPPONENT_OFFLINE`, `STALE_STATE`.

## 9. API HTTP

Tất cả dưới `/api`, JSON, cookie session. Lỗi trả `{ok:false, code, message}`.

| Phương thức | Đường dẫn | Quyền | Mục đích |
| --- | --- | --- | --- |
| GET | `/api/config` | công khai | Cho biết email có bật không |
| POST | `/api/auth/register` | công khai | Đăng ký |
| POST | `/api/auth/login` | công khai | Đăng nhập |
| POST | `/api/auth/logout` | công khai | Đăng xuất |
| GET | `/api/auth/me` | công khai | Thông tin tài khoản hiện tại (hoặc null) |
| POST | `/api/auth/forgot-password` | công khai | Gửi link đặt lại mật khẩu |
| POST | `/api/auth/reset-password/check` | công khai | Kiểm tra token còn hạn |
| POST | `/api/auth/reset-password` | công khai | Đặt mật khẩu mới |
| POST | `/api/auth/verify-email` | công khai | Xác thực email |
| POST | `/api/me/email` | đăng nhập | Đổi email |
| POST | `/api/me/email/resend` | đăng nhập | Gửi lại thư xác thực |
| POST | `/api/me/password` | đăng nhập | Đổi mật khẩu |
| DELETE | `/api/me` | đăng nhập | Xoá tài khoản |
| GET | `/api/history` | đăng nhập | Danh sách ván, lọc + phân trang |
| GET | `/api/history/:id` | đăng nhập | Chi tiết ván để xem lại |
| GET | `/api/stats` | đăng nhập | Thống kê theo cỡ bàn |

Ngoài `/api`: `GET /health` trả `{status:"ok"}` cho hosting.

## 10. Cơ sở dữ liệu

Hỗ trợ **PostgreSQL** (khi có `DATABASE_URL`) và **SQLite** (mặc định `data/meo.db`). Migration có version, chạy tự động khi khởi động.

Các bảng:

- `schema_migrations`: version đã chạy.
- `users`: id, username duy nhất, tên hiển thị, hash mật khẩu, avatar, email, thời điểm xác thực email, email đang chờ, ngày tạo/đăng nhập cuối/xoá mềm.
- `sessions`: hash token (khoá chính), user, hạn, lần dùng cuối, user-agent.
- `matches`: một ván đã lưu — phòng, cỡ bàn, luật thắng, hai người chơi (id nếu có), tên/avatar, người đi trước, kết quả, lý do, chuỗi thắng, `moves` JSON, tổng nước, thời gian.
- `user_stats`: thắng/thua/hòa theo `(user_id, size_key)`.
- `email_verifications`: token xác thực email (chỉ hash), hạn, đã dùng.
- `password_resets`: token đặt lại mật khẩu (chỉ hash), hạn, đã dùng.

Index: username, lịch sử theo từng người + thời gian, session theo user/hạn, token email/mật khẩu theo user/hạn, email đã xác thực duy nhất (partial index).

## 11. Biến môi trường

Sao chép `.env.example` thành `.env`; không commit `.env`.

| Biến | Bắt buộc | Ý nghĩa |
| --- | --- | --- |
| `NODE_ENV` | không | `production` bật kiểm tra bí mật và cookie Secure |
| `PORT` | không | Cổng HTTP, mặc định 3000 |
| `DATABASE_URL` | không | Chuỗi PostgreSQL; để trống thì dùng SQLite |
| `DATABASE_FILE` | không | Đường dẫn SQLite, mặc định `data/meo.db` |
| `SESSION_SECRET` | production | Bí mật ký/namespace session, tối thiểu 32 ký tự |
| `SESSION_DAYS` | không | Hạn session, mặc định 30 ngày |
| `TRUST_PROXY` | không | `1` khi sau Render/Railway/reverse proxy |
| `CORS_ORIGIN` | không | Origin phụ được phép cho CSRF |
| `PGSSL` | không | Buộc SSL cho PostgreSQL |
| `PUBLIC_URL` | production | URL công khai dùng tạo link trong email (production phải https) |
| `MAIL_PROVIDER` | không | `console`, `smtp`, `resend`, `test` |
| `MAIL_FROM` | khi gửi thư | Địa chỉ gửi |
| `SMTP_HOST/PORT/SECURE/USER/PASS` | khi `smtp` | Cấu hình SMTP |
| `RESEND_API_KEY` | khi `resend` | Khoá API Resend |
| `RESET_TOKEN_MINUTES` | không | Hạn link đặt lại, mặc định 30 phút |
| `VERIFY_TOKEN_HOURS` | không | Hạn link xác thực, mặc định 24 giờ |
| `UNDO_TIMEOUT_MS` | không | Thời gian đối thủ trả lời yêu cầu đi lại, mặc định 15 giây |
| `UNDO_COOLDOWN_MS` | không | Cooldown sau khi bị từ chối/hết giờ, mặc định 10 giây |

## 12. Giới hạn đã biết

- Phòng online nằm trong RAM: khởi động lại server là mất phòng đang chơi. Ứng dụng chạy một instance.
- Khách đấu khách không lưu lịch sử; khách không có thống kê.
- Chưa có đăng nhập bằng email/OAuth; email chỉ để xác thực và khôi phục.
- Gửi thư phụ thuộc nhà cung cấp ngoài; Gmail có hạn mức ngày, Resend cần xác minh domain.
- Bộ test tự động chạy SQLite; PostgreSQL cần kiểm tra tay với `DATABASE_URL` riêng.
- Hosting free (Render) ngủ sau ~15 phút không dùng; lần mở đầu có thể chậm, ứng dụng tự thử lại.
- Bàn vô cực có giới hạn kỹ thuật 2000 nước; ván rất dài sẽ hòa.
- Đi lại online cần đối thủ trả lời trong 15 giây; tối đa 3 lần/người/ván và có cooldown 10 giây sau lần bị từ chối/hết giờ. F5 đúng lúc đang chờ sẽ hủy yêu cầu (server coi là mất kết nối), không khôi phục hộp thoại sau khi tải lại.
- Chưa có giải đấu, chat tự do, hay xếp hạng toàn cầu.
