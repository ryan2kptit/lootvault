# LootVault: Design Spec (v3)

- **Ngày:** 2026-10-03
- **Trạng thái:** Đã duyệt cả 6 phần thiết kế qua buổi brainstorm. Đang chờ review spec.
- **Thay thế:** `2026-10-02-lootvault-design.md` (v2). Có thể xem lại bản cũ trong lịch sử git.
- **Bối cảnh:**
  - Đây là project cá nhân để phỏng vấn **vị trí Fullstack** tại Game Locker. Game Locker là marketplace TCG nhiều cửa hàng, frontend dùng Next.js App Router.
  - Vòng phỏng vấn gồm hai phần: (1) show project; (2) **interviewer đưa yêu cầu thêm/sửa tính năng ngay tại chỗ, ứng viên code live trên máy mình trong 30–60 phút**.
  - Thời gian chuẩn bị: 2–3 ngày.

---

## 1. Mục tiêu và tiêu chí thành công

| # | Tiêu chí | Cách kiểm chứng |
|---|---|---|
| G1 | Publisher tạo store và upload NFT (ảnh, tên, mô tả, supply, giá) trong **Studio**. Người mua vào trang store trên **Storefront** để xem, search/filter, bỏ vào giỏ và mua | Demo end-to-end trên local |
| G2 | Không oversell: 20 ví tranh 5 bản cuối cùng thì đúng 5 thành công, 15 bị revert `SoldOut`, và **DB khớp với chain** | `npm run demo:race` in ra PASS |
| G3 | Toàn bộ chạy local bằng `docker compose up -d`, `npm run bootstrap`, `npm run dev` | Làm theo README trên máy sạch |
| G4 | Deploy được lên AWS: Lambda, API Gateway, S3, SNS/SQS, EventBridge, Amplify, cùng MongoDB Atlas M0 và Base Sepolia | `npm run deploy:aws` theo guide |
| G5 | **Phần lớn tính năng interviewer có thể yêu cầu chỉ cần sửa backend và frontend, không đụng Solidity** | 6/7 live feature trong playbook không sửa contract |
| G6 | Có test cho các bất biến quan trọng | Hardhat test và Jest đều xanh |

## 2. Scope

**MVP (build sẵn):**

- **Lõi Studio:**
  - Đăng nhập bằng SIWE.
  - Tạo store: mỗi ví 1 store, gồm tên, slug, mô tả, logo.
  - CRUD NFT item, publish/unpublish, đổi giá.
  - Dashboard: doanh thu, số đơn, số bản đã bán, biểu đồ 7 ngày.
  - Danh sách đơn bán.
- **Lõi Storefront:** danh sách store, trang store, trang chi tiết NFT, mua theo số lượng, My collection, My orders.
- **Bổ sung:**
  - **Giỏ hàng:** nhiều NFT của cùng một store, thanh toán trong 1 giao dịch.
  - **Search và filter/sort** trong trang store.
  - **Recent sales** trên trang NFT và dashboard.

**Để dành làm live feature** (playbook có kịch bản luyện sẵn cho từng cái):

1. Tùy biến giao diện store (banner, màu chủ đạo)
2. Mã giảm giá theo store
3. Giới hạn số bản mỗi ví được mua
4. Giữ hàng cứng (reservation)
5. Wishlist hoặc giỏ hàng lưu phía server
6. Notification cho publisher
7. Royalty EIP-2981 (feature duy nhất phải sửa contract)

**Ngoài scope:** secondary market, offers/bids, auction, một ví nhiều store, refresh token, CloudFront, CI/CD, search toàn sàn, test UI tự động.

## 3. Kiến trúc

```
 Studio (Next.js :3000)          Storefront (Next.js :3100, SSR)
        │ local: Next rewrites /api/<svc>/* → service | AWS: API Gateway HTTP API
        ▼
 auth-svc :3001     catalog-svc :3002          order-svc :3003            indexer-svc :3004
 SIWE → JWT         store, item, ảnh S3,       checkout (giỏ hàng),       quét chain định kỳ
                    search/filter, sold,       platform ký, xác nhận
                    holdings                   đơn, thống kê, recent sales
 db auth            db catalog                 db order                   db indexer
        order-svc ──sync HTTP (x-internal-key)──► catalog-svc /catalog/internal/*
 SNS chain-events ──► SQS catalog-q (TransferSingle) · order-q (Purchased), mỗi queue có DLQ
   ▲ publish bởi indexer (quét định kỳ) và order-svc fast-path (1 tx), cùng event ID
 Chain: Hardhat node 31337 (local) | Base Sepolia 84532 (AWS) · Contract: LootVault1155
```

**Các quyết định đã chốt** (mỗi quyết định có một ADR trong `docs/adr/`):

1. **Bốn service, mỗi ranh giới có một lý do riêng:**
   - auth: biên bảo mật, ít thay đổi.
   - catalog: đọc nhiều, có thể cache.
   - order: ghi nhiều, nắm giữ tiền.
   - indexer: worker nền, chỉ chạy 1 instance, phụ thuộc chain.
2. **Full MongoDB, mỗi service một database riêng** (`auth`, `catalog`, `order`, `indexer`).
   - Local dùng chung 1 container. AWS dùng chung 1 cluster Atlas M0.
   - Lý do: chỉ một công nghệ để học và bảo vệ, và query linh hoạt khi phải code live.
   - Đã cân nhắc DynamoDB và loại vì không có nhu cầu thật.
3. **Sync cho command cần dữ liệu tươi, async cho projection.**
   - Checkout gọi catalog đồng bộ để lấy giá, trạng thái và tồn kho.
   - `sold`, holdings và trạng thái đơn được cập nhật qua event.
4. **Xác nhận thanh toán theo kiểu hybrid:** fast-path cộng indexer làm lưới an toàn.
   - Fast-path là một **indexer thu nhỏ cho đúng 1 tx**: đọc receipt, decode log, publish **cùng các event** với **cùng ID** `chainId:txHash:logIndex`.
   - Consumer khử trùng bằng **inbox nằm cùng Mongo transaction với side effect**, nên mỗi event chỉ có hiệu lực đúng một lần.
5. **Chain là nguồn sự thật** cho quyền sở hữu và thanh toán. DB là projection, nhất quán theo kiểu eventual.
6. **Hexagonal adapters:** cùng một handler domain chạy qua HTTP (Nest app local hoặc serverless-express trên Lambda) và qua message (SQS poller local hoặc Lambda SQS event).
7. **Luật nghiệp vụ viết thành pure function** (`cart-rules.ts`, `pricing.ts`, `order-state.ts`), để test nhanh và để TDD được khi code live.

## 4. Smart contract `LootVault1155` ("contract ngốc")

Kế thừa OpenZeppelin 5: `ERC1155`, `EIP712("LootVault","1")`, `Ownable`, `Pausable`, `ReentrancyGuard`. Solidity `0.8.28`.

```solidity
struct Line     { uint256 tokenId; address creator; uint256 quantity; uint256 unitPrice; uint256 maxSupply; }
struct Checkout { bytes32 orderId; address buyer; Line[] lines; uint256 deadline; }
function purchase(Checkout calldata c, bytes calldata platformSig) external payable;
```

**Bất biến và lỗi tương ứng**, kiểm tra theo đúng thứ tự:

| # | Kiểm tra | Lỗi |
|---|---|---|
| 1 | Contract không ở trạng thái pause | `EnforcedPause` (OZ) |
| 2 | Chữ ký EIP-712 trên `c` recover ra đúng `platformSigner` | `InvalidSignature` |
| 3 | `msg.sender == c.buyer` | `WrongBuyer` |
| 4 | `block.timestamp <= c.deadline` | `Expired` |
| 5 | `!usedOrders[c.orderId]`, sau đó đánh dấu đã dùng | `OrderUsed` |
| 6 | Với mỗi line: `creator ≠ 0` và `quantity > 0` | `InvalidLine(tokenId)` |
| 7 | Với mỗi line: `creatorOf[tokenId]` bằng 0 (lần bán đầu: **gán `creatorOf` và `maxSupplyOf` một lần duy nhất**) hoặc bằng `line.creator` | `CreatorMismatch(tokenId)` |
| 8 | Với mỗi line: `minted[tokenId] + quantity <= maxSupplyOf[tokenId]` (cap on-chain, không phải `line.maxSupply`) | `SoldOut(tokenId)` |
| 9 | `msg.value == Σ quantity × unitPrice` | `WrongPayment` |

**Hiệu ứng khi mua thành công:**
- Mỗi line: `minted += quantity`, `_mint(buyer, tokenId, quantity)` (emit `TransferSingle`).
- Phí của line = `lineTotal × feeBps / 10000`. Creator nhận `lineTotal − phí`. Tổng phí chuyển vào `treasury`. Tiền được chuyển theo kiểu push bằng `call`; lỗi thì revert `PayoutFailed`.
- Cuối cùng emit `Purchased(orderId, buyer, total, fee)`.

**Admin (chỉ owner):**
- `setPlatformSigner` (xoay key)
- `setTreasury`
- `setFeeBps` (tối đa 1000, tức 10%; mặc định 250)
- `setURI`
- `pause` / `unpause`

**Các quy ước khác:**
- **`tokenId = BigInt('0x' + itemId)`**, với itemId là ObjectId của Mongo. Không cần bộ đếm, và đi ngược từ tokenId về item rất dễ.
- **Metadata** dùng URI chuẩn ERC-1155 `{baseUri}/metadata/{id}.json`, trong đó `{id}` là hex 64 ký tự viết thường. Contract không lưu URI riêng cho từng token.

**Trade-off đã chấp nhận:**
- Publisher phải tin platform về giá.
- Nếu lộ platform key: dùng `pause` để dừng, xoay key bằng `setPlatformSigner`. Vì **edition size và creator bị khoá on-chain từ lần bán đầu**, kẻ giữ key **không thể** đổi creator hay bơm thêm supply cho những NFT đã bán. Phần vẫn hở: kẻ đó có thể mint miễn phí, hoặc chiếm trước, những item **chưa bán bản nào**. Cách xử lý: tạo lại item đó, sẽ có ObjectId mới nên tokenId mới. Ở production nên ký bằng KMS secp256k1. (Phát hiện này đến từ review Task 4 của Plan 1.)
- Checkout đã ký vẫn còn hiệu lực tối đa 5 phút, và chỉ với đúng buyer và đúng orderId trong đó. Unpublish hay đổi giá có hiệu lực ngay cho các checkout mới.

## 5. Services

**Quy ước chung** (nằm trong `packages/nest-common`):
- NestJS 11.
- `ValidationPipe` với `whitelist` và `transform`.
- Lỗi throw `AppError(code, httpStatus, details?)`. Global filter trả về `{ error: { code, message, details? } }`.
- Header `x-request-id` được truyền qua lời gọi sync và đưa vào event envelope dưới tên `correlationId`.
- Log JSON bằng pino.
- Swagger tại `/<prefix>/docs`.
- Danh sách phân trang dạng offset `?page=&limit=` (limit tối đa 50), trả về `{ items, page, limit, total }`.
- **JWT HS256** `{ sub: address }`, TTL 2h (`JWT_TTL`). Mỗi service tự verify bằng `JwtGuard` dùng chung.
- Phân quyền dựa trên ownership, không có role.
- **Tiền** lưu bằng `Decimal128` (wei). API trả về dạng string wei.
- Địa chỉ ví luôn lưu dạng lowercase.

### 5.1 auth-svc (prefix `/auth`, db `auth`)

**Collections:**
- `users {_id: address, createdAt, lastLoginAt}`
- `nonces {_id: nonce, address, expiresAt}` với TTL index trên `expiresAt` (5 phút)

| API | Mô tả |
|---|---|
| `GET /auth/nonce?address=` | Tạo nonce ngẫu nhiên |
| `POST /auth/verify {message, signature}` | `viem/siwe`: parse, kiểm tra domain/uri/chainId từ env, verify chữ ký. Consume nonce bằng `findOneAndDelete({_id: nonce, address})`; không tìm thấy thì `401 NONCE_INVALID`. Upsert user, trả `{accessToken, address, expiresAt}` |
| `GET /auth/me` | `{address, createdAt}` |

### 5.2 catalog-svc (prefix `/catalog`, db `catalog`)

**Collections:**
- `stores {_id, slug (unique, ^[a-z0-9-]{3,32}$), ownerAddress (unique), name, description, logoUrl, createdAt}`
- `items {_id, storeId, ownerAddress, tokenId (string, unique), name, description, imageUrl, supply, sold, priceWei: Decimal128, status: DRAFT|LIVE|HIDDEN, createdAt, updatedAt}`
  - Text index trên `{name, description}`.
  - Index `{storeId, status, createdAt}`, `{storeId, status, priceWei}`.
- `holdings {_id: "address:tokenId", address, tokenId, itemId, balance}`, index `{address}`
- `processed_events {_id: eventId, processedAt}`

| Nhóm | API | Mô tả |
|---|---|---|
| Upload | `POST /catalog/uploads/presign {contentType}` (JWT) | Presigned **POST**: `content-length-range ≤ 5MB`, `Content-Type` thuộc png/jpeg/webp/gif, key `media/{uuid}.{ext}`. Trả `{url, fields, publicUrl}` |
| Store | `POST /catalog/stores` (JWT) | Tạo store. Lỗi `409 STORE_EXISTS` hoặc `409 SLUG_TAKEN` |
| | `GET /catalog/stores` · `GET /catalog/stores/:slug` | Public |
| | `GET /catalog/stores/me` (JWT) | Store của tôi, hoặc `404 STORE_NOT_FOUND` |
| Studio | `POST /catalog/items` (JWT, owner) | Tạo DRAFT `{name, description, imageUrl, supply(1..10000), priceWei}` |
| | `PATCH /catalog/items/:id` (JWT, owner) | Sửa tên, mô tả, ảnh, giá. **Chỉ sửa được supply khi `sold == 0`**, vì contract khoá edition size từ lần bán đầu. Nếu `sold > 0` thì trả `409 SUPPLY_LOCKED` |
| | `POST /catalog/items/:id/publish` (JWT, owner) | Ghi metadata JSON lên S3 `metadata/{64hex}.json` gồm `{name, description, image, external_url}`, rồi chuyển LIVE |
| | `POST /catalog/items/:id/unpublish` (JWT, owner) | Chuyển HIDDEN |
| | `GET /catalog/me/items` (JWT) | Mọi item của store tôi, đủ mọi status |
| Storefront | `GET /catalog/stores/:slug/items?q=&minPrice=&maxPrice=&inStock=&sort=newest\|price_asc\|price_desc&page=&limit=` | Chỉ trả item LIVE. Search bằng `$text`; `inStock` lọc theo `$expr: sold < supply` |
| | `GET /catalog/items/:id` | Public. Item HIDDEN chỉ owner xem được |
| | `GET /catalog/holdings/:address` | Holdings kèm thông tin item |
| Internal | `POST /catalog/internal/items/batch {ids}` (`x-internal-key`) | `[{id, storeId, ownerAddress, tokenId, status, priceWei, supply, sold, name, imageUrl}]` |

**Consumer `catalog-q`:** nhận `chain.TransferSingle`. Trong cùng một inbox transaction:
- Nếu `from == 0x0` thì `$inc items.sold` theo `value` (item tìm theo `tokenId`).
- Trừ balance của `from` (nếu khác 0x0) và cộng balance của `to`.

### 5.3 order-svc (prefix `/orders`, db `order`)

**Collections:**
- `orders {_id, orderId (bytes32 hex, unique), buyer, storeId, sellerAddress, lines: [{itemId, tokenId, name, imageUrl, quantity, unitPriceWei}], totalWei, feeWei?, status: PENDING|PAID|EXPIRED, deadline, txHash?, paidAt?, createdAt}`
  - Index `{buyer, createdAt}`, `{storeId, status, paidAt}`, `{"lines.itemId", status, paidAt}`, `{status, deadline}`.
- `processed_events`

| API | Mô tả |
|---|---|
| `POST /orders/checkout {lines:[{itemId, quantity}]}` (JWT) | Xem luồng bên dưới. Trả `{order, purchase: {chainId, contract, checkout, signature, value}}` |
| `POST /orders/:id/confirm {txHash}` (JWT, buyer) | **Fast-path**, xem bên dưới. Trả order (PAID), hoặc `202 {status: "PENDING_TX"}` nếu chưa có receipt |
| `GET /orders/me` · `GET /orders/:id` | Buyer hoặc seller |
| `GET /orders/store/me` · `GET /orders/store/me/stats` | Seller. Stats gồm `{grossWei, netWei, ordersPaid, itemsSold, last7Days:[{date, grossWei, orders}]}` |
| `GET /orders/recent-sales?storeId=\|itemId=&limit=` | Public. Lấy các order PAID, sắp theo `paidAt` giảm dần |

Route tĩnh (`/me`, `/store/me`, `/recent-sales`) phải được khai báo **trước** `/:id`.

**Luồng checkout:**
1. Validate (pure function `validateCart`):
   - Có 1–10 line, mỗi line số lượng 1–10, không trùng item.
2. Gọi catalog internal batch; timeout 3s, lỗi thì trả `503 CATALOG_UNAVAILABLE`.
3. Kiểm tra:
   - Mọi item LIVE (lỗi `409 ITEM_UNAVAILABLE`).
   - Cùng một store (lỗi `400 MIXED_STORES`).
   - **Soft stock:** `supply − sold − Σ qty(các order PENDING có deadline > now chứa item này) ≥ quantity` (lỗi `409 INSUFFICIENT_STOCK`).
4. `pricing.ts` tính `unitPriceWei` cho từng line. MVP lấy giá niêm yết; đây là chỗ để gắn mã giảm giá khi code live.
5. Tạo order PENDING với `deadline = now + 5 phút` và `orderId = 0x + 64 hex` (ngẫu nhiên).
6. Ký Checkout bằng `PLATFORM_SIGNER_KEY` (viem `signTypedData`).

**Luồng confirm (fast-path):**
1. `getTransactionReceipt(txHash)`.
2. Yêu cầu `status = success` và `to == contract`, ngược lại `422 TX_INVALID`.
3. Decode các log của contract.
4. Yêu cầu có `Purchased` với `orderId` và `buyer` khớp order, ngược lại `422 TX_MISMATCH`.
5. Xử lý `Purchased` ngay trong inbox transaction, chuyển order sang PAID.
6. Publish **mọi** log đã decode lên SNS, cùng event ID với indexer.

**State machine** (`order-state.ts`, mỗi chuyển trạng thái là một update có điều kiện theo status hiện tại):
- `PENDING → PAID` khi nhận `Purchased`.
- `PENDING → EXPIRED` khi sweeper thấy `deadline + 120s < now`.
- `EXPIRED → PAID` khi event đến muộn, vì chain là nguồn sự thật.
- Mọi chuyển trạng thái khác đều không hợp lệ.

**Consumer `order-q`:** nhận `chain.Purchased`. Trong inbox transaction: tìm order theo `orderId`, chuyển sang PAID, ghi `txHash`, `paidAt` (theo block timestamp) và `feeWei`.

**Sweeper:** local dùng `@nestjs/schedule` mỗi 60s. AWS dùng EventBridge `rate(5 minutes)`.

### 5.4 indexer-svc (db `indexer`)

**Collection:** `cursors {_id: "chainId:contract", lastBlock}`. Lần chạy đầu bắt đầu từ `START_BLOCK`, là block deploy contract do bootstrap ghi ra.

**Mỗi tick:**
1. Tính `to = min(head − CONFIRMATIONS, lastBlock + BATCH)`. Nếu `to ≤ lastBlock` thì bỏ qua lượt này.
2. Gọi `getLogs({address: contract, events: [Purchased, TransferSingle], fromBlock: lastBlock+1, toBlock: to})`.
3. Sắp theo `(blockNumber, logIndex)` rồi publish lên SNS.
4. `findOneAndUpdate({_id, lastBlock: prev}, {$set: {lastBlock: to}})`. Nếu không match thì có instance khác đã chạy trước, log cảnh báo rồi dừng.

**Cấu hình:**

| | `CONFIRMATIONS` | `BATCH` | Lịch chạy |
|---|---|---|---|
| Local | 0 | 500 | Vòng lặp mỗi 2s |
| Base Sepolia | 3 | 500 | Lambda chạy mỗi phút, lặp tối đa ~45s |

**Event envelope** (SNS raw message, message attribute `type` dùng cho filter policy):
```json
{ "id": "84532:0xTX:3", "type": "chain.Purchased", "chainId": 84532, "blockNumber": 123,
  "blockTimestamp": 1730000000, "txHash": "0x..", "logIndex": 3, "correlationId": "..",
  "data": { "orderId": "0x..", "buyer": "0x..", "total": "1000", "fee": "25" } }
```
`chain.TransferSingle.data = { operator, from, to, id, value }`, các số được giữ ở dạng string.

## 6. Frontend

**Stack:**
- 2 app **Next.js 15 App Router**, React 19, Tailwind v4, shadcn/ui, TanStack Query, zustand (giỏ hàng).
- **wagmi + viem.** viem cũng được dùng ở backend: EIP-712, `viem/siwe`, decode log.

**`packages/web-shared`** chứa:
- api client: lỗi `{error:{code}}` được map thành thông báo dễ hiểu.
- Cấu hình wagmi (chain lấy từ env).
- `useSiweLogin`: JWT lưu trong localStorage, key tách theo từng app.
- UI dùng chung: `NftCard`, `PriceTag`, `TxStatusStepper`, `WalletButton`.

**Ví:**
- **Demo wallet:** dùng connector `mock` của wagmi trỏ vào các tài khoản có sẵn của Hardhat node; node tự ký hộ. Có dropdown chọn vai: "Publisher A / Publisher B / Buyer 1–3".
  - Chỉ bật khi `NEXT_PUBLIC_CHAIN_ID=31337`.
- Ví injected (MetaMask) luôn có sẵn.

**Gọi API:**
- **Phía client:** `NEXT_PUBLIC_API_URL`. Local là `/api`, Next rewrite `/api/auth/*` → `:3001/auth/*`, tương tự cho catalog và orders. Trên AWS là URL của API Gateway.
- **Phía server (SSR):** `API_INTERNAL_URL`.

**Studio (`:3000`, các trang cần đăng nhập là client component):**

| Trang | Nội dung |
|---|---|
| `/` | Connect ví, Sign-in. Chưa có store thì vào onboarding (tên, slug, mô tả, logo). Có store rồi thì chuyển sang `/dashboard` |
| `/dashboard` | Thẻ gross/net, số đơn, số bản đã bán; biểu đồ 7 ngày (recharts); recent sales |
| `/items` | Bảng: ảnh, tên, badge trạng thái, giá (ETH), `sold/supply`, các nút publish/unpublish/sửa |
| `/items/new`, `/items/[id]` | Form: upload ảnh (presigned POST, có tiến trình), tên, mô tả, supply, giá ETH (quy đổi sang wei bằng `parseEther`) |
| `/orders` | Danh sách đơn bán |
| Header | Nút "View storefront" mở `{STOREFRONT_URL}/s/{slug}` |

**Storefront (`:3100`, các trang public là server component):**

| Trang | Nội dung |
|---|---|
| `/` | Danh sách store |
| `/s/[slug]` | Header store. Search, filter giá và còn hàng, sort, **tất cả nằm trên URL search params** để render lại phía server và share link được. Lưới NFT có badge "Còn N" hoặc "Sold out", có phân trang |
| `/s/[slug]/items/[id]` | `generateMetadata` sinh OG tags. Ảnh, mô tả, giá, số còn lại, chọn số lượng, "Thêm vào giỏ" / "Mua ngay", recent sales |
| `/s/[slug]/cart` | Giỏ của store, lưu localStorage key `cart:{slug}` |
| `/me` | My collection (holdings) và My orders |

**Luồng mua** (`TxStatusStepper`): Tạo đơn → Xác nhận trong ví → Chờ block → Confirm → **Đã thanh toán ✅**.
- Nếu confirm trả 202, UI poll `GET /orders/:id` mỗi 2s.
- Lỗi revert được decode và đổi thành câu dễ hiểu:
  - `SoldOut` thành "Vừa hết hàng"; UI refresh lại item và giảm số lượng trong giỏ.
  - `Expired` thành "Phiên thanh toán hết hạn, thử lại".
  - `UserRejected` thành "Bạn đã huỷ giao dịch".

## 7. Độ tin cậy và xử lý lỗi

| Sự cố | Hành vi |
|---|---|
| User đóng tab sau khi gửi tx | Indexer bắt `Purchased` và chuyển order sang PAID |
| Fast-path và indexer giao trùng một event | Trùng `_id` trong `processed_events` nên lần sau là no-op |
| Consumer crash giữa transaction | Transaction bị abort, SQS giao lại sau visibility timeout (30s) |
| Poison message | Sau 5 lần vào DLQ, CloudWatch alarm báo. Sửa xong chạy `npm run dlq:redrive` |
| Indexer crash sau khi publish, trước khi đẩy cursor | Publish lại cùng các event, inbox khử trùng |
| Hai indexer chạy cùng lúc | Cursor update có điều kiện; Lambda reserved concurrency = 1 |
| Reorg | Đợi 3 confirmation. Reorg sâu hơn ghi vào playbook (lưu blockHash, rollback) |
| catalog sập lúc checkout | Trả 503, không tạo order (fail closed) |
| Hai người cùng checkout món cuối | Contract chỉ cho một tx thành công, tx kia revert `SoldOut`. Đơn thua sẽ EXPIRED |
| Đã ký nhưng không gửi tx | Order EXPIRED, soft stock tự được nhả |
| Event đến sau khi order đã EXPIRED | `EXPIRED → PAID` |
| RPC sập | Indexer thử lại ở tick sau. Fast-path trả 202, UI tiếp tục poll |
| Publish SNS trong fast-path thất bại | Order đã PAID; catalog vẫn nhận `TransferSingle` từ indexer |

## 8. Testing

| Lớp | Công cụ | Nội dung |
|---|---|---|
| Contract | Hardhat 3 + viem (node:test + `viem.assertions`) | Mua thành công và chia tiền đúng; giỏ nhiều line; SoldOut; Expired; WrongBuyer; replay orderId; sai chữ ký; WrongPayment; đang pause; CreatorMismatch; quyền admin |
| Domain | Jest | `validateCart`, `pricing`, `order-state` (đủ bảng chuyển trạng thái), `buildCheckoutTypedData`, decode receipt |
| Integration | Jest + mongodb-memory-server (replica set) | Inbox: cùng một event xử lý 2 lần thì `sold` chỉ tăng 1. Checkout với catalog client được mock. Nonce SIWE dùng lại bị từ chối. Cursor có điều kiện |
| E2E demo | Script | `demo:race` (G2) và `demo:smoke` (toàn bộ luồng từ publisher tới buyer qua API và chain) |
| Frontend | Thủ công | Playwright ghi vào playbook như bước tiếp theo |

## 9. Chạy local

**Yêu cầu:**
- **Node 22 LTS.** Node 20 hết hạn hỗ trợ từ 04/2026, và Hardhat 3 cần Node ≥ 22.13. Máy hiện tại đang chạy 20.18, cần nâng cấp.
- Docker Desktop.

**`docker-compose.yml`:**
- `mongo:7` chạy `--replSet rs0`, healthcheck tự gọi `rs.initiate`, port 27017.
- `motoserver/moto` giả lập S3, SNS, SQS, port 4566.
- `chain`: **anvil** (Foundry 1.5.1, image tự build từ Debian và GitHub Releases), port 8545, chainId 31337. Có `--state` nên chain giữ nguyên qua các lần restart, luôn khớp với Mongo. Không dùng `hardhat node` vì mất state khi restart. Không pull image từ ghcr.io vì máy này bị trả 403.

**Lệnh:**

| Lệnh | Việc nó làm |
|---|---|
| `npm install` | Cài toàn bộ workspace |
| `docker compose up -d` | Chạy các container trên |
| `npm run bootstrap` | Deploy contract. Tạo bucket (CORS, public-read cho `media/` và `metadata/`), topic, queue, DLQ, subscription kèm filter. Ghi `.env.local` (địa chỉ contract, start block, URL các queue). Chạy seed: 2 store, ~12 NFT có ảnh mẫu trong `scripts/assets/` |
| `npm run dev` | `concurrently` chạy 4 service (watch) và 2 app Next, log mỗi service một màu |
| `npm run doctor` | Kiểm tra port, container, contract, queue |
| `npm run reset` | Xóa DB, redeploy, seed lại |

**Local khác AWS ở đâu:** SQS được đọc bằng `SqsPoller` (long-poll) trong process của Nest. Sweeper và indexer chạy bằng `@nestjs/schedule` hoặc vòng lặp. Handler domain dùng chung cho cả hai.

**Nếu moto không đáp ứng được** SNS→SQS kèm filter policy, hoặc CORS cho S3 POST, thì dùng `localstack/localstack:4.4` pinned. LocalStack bản mới hơn bắt buộc auth token từ 03/2026. Đây là task kiểm tra đầu tiên trong plan.

## 10. Deploy AWS (SAM, region `ap-southeast-1`)

| Thành phần | Dịch vụ |
|---|---|
| API | HTTP API với các route `/auth/{proxy+}`, `/catalog/{proxy+}`, `/orders/{proxy+}`, có CORS. Lambda `AuthApi`, `CatalogApi`, `OrderApi` (serverless-express) |
| Consumer | Lambda `CatalogConsumer`, `OrderConsumer` với SQS event source, bật `ReportBatchItemFailures` |
| Lịch chạy | `OrderSweeper` theo `rate(5 minutes)`. `Indexer` theo `rate(1 minute)`, reserved concurrency 1, timeout 60s |
| Event bus | SNS `chain-events`, các SQS `catalog-q` và `order-q` (raw delivery, filter policy), mỗi queue một DLQ (maxReceiveCount 5), 2 CloudWatch alarm |
| Lưu trữ | S3 `media`: bucket policy public-read cho `media/*` và `metadata/*`, CORS cho 2 domain Amplify |
| Web | **Amplify Hosting:** 2 app kết nối repo GitHub (monorepo, `appRoot` = `apps/studio` và `apps/storefront`), có `amplify.yml` |
| DB | MongoDB Atlas M0 ở ap-southeast-1, network access `0.0.0.0/0` (Lambda nằm ngoài VPC, nên không tốn phí NAT) |
| Chain | Base Sepolia, RPC `https://sepolia.base.org` hoặc Alchemy free. Deployer cần ETH test từ faucet |

**Chi tiết triển khai:**
- **Runtime Lambda:** `nodejs22.x`, arm64, 512MB.
- **Kết nối Mongo:** cache ở module scope, `maxPoolSize: 5`, `serverSelectionTimeoutMS: 5000`.
- **Build:** `scripts/build-lambda.mjs` dùng esbuild và SWC để giữ `emitDecoratorMetadata`, mỗi service ra một bundle tại `dist/lambda/<svc>/index.js`. Các optional module của Nest được đánh dấu external. Có smoke test bằng `node -e "require(bundle)"`.
- **Secrets:** tham số SAM `NoEcho` gồm `MongoUri`, `JwtSecret`, `PlatformSignerKey`, `InternalApiKey`. Playbook nêu hướng production: Secrets Manager, và KMS secp256k1 để ký EIP-712.
- **Lệnh:** `npm run deploy:contract -- --network baseSepolia`, sau đó `npm run deploy:aws` (build bundle, `sam deploy`, in ra API URL để điền vào env của Amplify).
- **Lưu ý:** tài khoản AWS tạo sau 15/07/2025 dùng free plan dạng credit trong 6 tháng. Lambda, SNS, SQS vẫn có hạn mức always-free. Amplify, API Gateway và S3 được miễn phí trong phạm vi free tier hoặc credit.

## 11. Cấu trúc repo

```
lootvault/
├── apps/
│   ├── auth-svc/  catalog-svc/  order-svc/  indexer-svc/   # NestJS 11; mỗi app: src/main.ts (local), src/lambda.ts (AWS)
│   └── studio/  storefront/                                 # Next.js 15
├── packages/
│   ├── contracts/     # @lootvault/contracts: Hardhat 3 + OZ 5, test, script deploy (ghi deployments/<network>.json)
│   ├── shared/        # @lootvault/shared: ABI `as const`, EIP-712 types, event types, constants
│   ├── nest-common/   # @lootvault/nest-common: config (zod), AppError + filter, JwtGuard, InternalKeyGuard, pagination, pino, InboxService, SnsPublisher, SqsPoller, sqsHandler
│   └── web-shared/    # @lootvault/web-shared: api client, wagmi config, useSiweLogin, UI components
├── infra/template.yaml
├── scripts/           # bootstrap-local, seed (+assets/), demo-race, demo-smoke, dlq-redrive, doctor, reset, build-lambda
├── docker-compose.yml · .env.example · package.json (npm workspaces)
└── docs/              # INTERVIEW_PLAYBOOK.md, adr/, superpowers/specs|plans/
```

## 12. Tài liệu bàn giao

**`README.md` (tiếng Anh):** pitch, sơ đồ kiến trúc (mermaid), quickstart, hướng dẫn deploy AWS, tóm tắt các quyết định thiết kế.

**`docs/INTERVIEW_PLAYBOOK.md` (tiếng Việt):**
1. Pitch 2 phút.
2. **Kịch bản demo 10 phút:**
   - Tạo store, upload NFT, publish.
   - Mua qua giỏ hàng, rồi xem dashboard cập nhật.
   - Chạy `demo:race`.
   - Tắt indexer, mua tiếp: fast-path vẫn chạy.
   - Đóng tab ngay sau khi gửi tx: indexer cứu được đơn.
3. **Bài học từ các project cũ**, trình bày dạng bảng "trước → sau", có trích file:line:
   - Từ **nftify-api:**
     - Race condition ở bước settle.
     - Login không verify chữ ký.
     - Kafka groupId chứa `Date.now()`.
     - `setTimeout` cho auction.
     - Hash do client gửi lên.
     - Thiếu idempotency.
     - Test rỗng.
   - Từ **sc-studio-be:**
     - Secret bị commit vào `.env.exam`.
     - Auth bị comment.
     - Chạy JS do user gửi bằng `shell: true` (RCE).
     - Build dùng chung thư mục, không tách riêng cho từng user.
     - Toolchain bị pin cứng rồi lỗi thời (Hardhat 2.17.2 hỏng trên Node 20).
     - Testnet đã bị khai tử.
4. Tóm tắt các ADR.
5. **7 live feature** (danh sách ở mục 2). Mỗi feature có: yêu cầu giả định, các bước, file cần sửa, test cần viết trước, ước lượng thời gian, talking point.
6. **Q&A chuyên sâu:**
   - Scale gấp 100 lần: keyset pagination, Atlas Search, cache, tách read replica.
   - Consistency và reorg.
   - Cold start.
   - Bảo mật: key platform, KMS, rate limit.
   - "Tại sao lại là microservice?"
   - "Nếu làm lại bạn sẽ đổi gì?"
7. Checklist ngày phỏng vấn: `npm run doctor`, `npm run reset`, video dự phòng.

**`docs/adr/`:** 8 ADR, mỗi ADR ~1/2 trang:
- 4 service
- Full Mongo
- Contract ngốc + platform co-sign
- Hybrid confirmation
- Inbox pattern
- Next.js + Amplify
- Base Sepolia
- moto thay LocalStack

## 13. Rủi ro và phương án

| Rủi ro | Phương án |
|---|---|
| moto thiếu tính năng (SNS filter → SQS, CORS cho S3 POST) | Task đầu tiên của plan kiểm tra ngay. Nếu thiếu thì dùng `localstack:4.4` pinned |
| Bundle Nest bằng esbuild lỗi do decorator metadata | Dùng SWC plugin, đánh dấu external cho optional deps, smoke test `require` |
| Amplify chưa hỗ trợ đúng bản Next | Đã chọn Next 15. Kiểm tra lại tài liệu Amplify khi viết plan |
| Cold start Nest trên Lambda ~1–2s | Chấp nhận cho demo. Playbook nêu cách giảm: tăng memory, lazy import |
| Faucet Base Sepolia khó lấy ETH | Demo chính chạy local. AWS chỉ cần "deploy được", có thể quay video trước |
| Hardhat 3 mới, thay đổi cấu hình (ESM, `defineConfig`) | Dùng toolbox viem chính thức. Nếu vướng thì dùng Hardhat 2.29 + `hardhat-toolbox-viem` (bản này chạy được trên Node 20/22) |
| Máy đang chạy Node 20.18 | Nâng lên Node 22 LTS trước khi bắt đầu, sẽ hỏi bạn trước khi cài |
| Connector `mock` của wagmi không ký được qua node của Hardhat 3 | Viết custom connector dùng `privateKeyToAccount` của viem, nạp các key mặc định của Hardhat (chỉ khi chạy ở chainId 31337) |
