# Personal Record

一个纯前端(无构建工具、无框架)的个人记录网页应用:训练打卡(有氧/力量隔天交替)、生理期记录、每日心情/工作状态/加餐记录。数据通过 GitHub Contents API 存在你自己的私有仓库里,手机和电脑用同一个 GitHub Personal Access Token 就能同步。

线上地址:https://starwingc.github.io/personal-record/

## 目录结构

```
index.html          页面骨架 + 5 个视图容器 + 静态的"指南"文案 + 底部导航
css/style.css        全部样式(墨水屏风格:黑白、无圆角、无阴影、无过渡动画)
js/app.js            路由 + 渲染 + 事件绑定(唯一直接操作 DOM 的文件)
js/github-api.js     GitHub Contents API 读写封装 + 本地模式回退 + 失败重试
js/schedule.js        训练排期生成/顺延/勾选逻辑(纯函数,无副作用)
js/period.js          生理期周期估算(纯函数)
js/mood.js            每日心情/工作状态/加餐记录的增删查(纯函数)
js/date-utils.js      日期字符串("YYYY-MM-DD")处理小工具
```

`schedule.js` / `period.js` / `mood.js` / `date-utils.js` 都是不依赖 DOM 的纯函数模块,可以直接用 `bun run` 之类的脚本单独测试。`app.js` 是唯一知道 `document`/`window` 存在的文件。

## 两个 GitHub 仓库

- **`personal-record`(公开)**——本仓库,只放前端代码,没有任何隐私数据,靠这个公开性才能免费用 GitHub Pages。
- **`personal-record-data`(私有)**——只放一个 `data.json`,存实际的训练/生理期/心情记录。通过用户在"设置"页填的 PAT 读写,PAT 只授权这一个仓库的 Contents 读写权限。

两者的关联只在浏览器的 `localStorage` 里(设置页填的 owner/repo/branch/path/token),代码里没有写死。

## 数据模型(`personal-record-data/data.json`)

```json
{
  "schedule": [
    { "date": "2026-07-13", "type": "cardio", "completed": false, "checkedItems": [] }
  ],
  "periodLogs": ["2026-06-02", "2026-07-01"],
  "dailyLogs": [
    { "date": "2026-07-13", "mood": 4, "work": 3, "note": "...",
      "noLunchSnack": true, "noDinnerSnack": false, "noSnackDay": false }
  ],
  "settings": { "scheduleWindowDays": 45 },
  "meta": { "lastUpdated": "2026-07-13T09:00:00Z" }
}
```

- **`schedule`**:滚动窗口(约45天),`type` 严格按 cardio/strength 交替。`checkedItems` 是勾选的动作名字符串数组,`completed` 由 `checkedItems.length >= 该类型动作总数` 自动推导,不单独手动设置。
- **`periodLogs`**:经期开始日期,独立于 `schedule`,**顺延不会影响它**。
- **`dailyLogs`**:每天一条(按 `date` upsert),同样独立于 `schedule`。

## 训练排期与"顺延"

`schedule.js` 把排期存成显式的 `{date, type, completed, checkedItems}` 数组,而不是"起始日期+偏移量"这种需要重放历史事件才能算出今天是什么的方案。

- `ensureWindow()`:每次加载数据后调用,如果数组尾部离今天不足 20 天就往后补,补的时候延续 cardio/strength 交替规律。
- `postpone(schedule, dateStr)`:找到目标日期的下标,把它和它之后的所有条目日期都 +1 天,再在末尾补一条新的(继续交替),数组长度不变。**被腾出来的那个日期不会留下任何记录**——渲染时找不到 entry 就直接当"顺延/休息日"显示,不需要专门的 rest 类型。
- `setCheckedItems(schedule, dateStr, checkedItems)`:一次性替换某天的整份勾选列表(配合下面的"批量保存"设计)。

## GitHub 同步(`github-api.js`)

- 未配置 owner/repo/token 时自动退回**本地模式**(读写 `localStorage`),不需要 PAT 也能把整个 UI 跑起来测试。
- `loadData()` / `mutate(mutationFn)` 都走同一个 `withRetry()`:不管是 409(sha 冲突,两台设备几乎同时写)还是普通网络抖动(比如 Safari 的 "Load failed"),都会重试,每次重试前有个小的随机退避,重试时会重新 GET 最新的 sha 再应用同一个修改,不是重放旧数据。
- 读请求带 `cache: 'no-store'` + 时间戳参数,避免浏览器缓存返回过期的 sha 导致永远 409。
- 写入用 GitHub Contents API 的标准"读 sha → 带 sha 写"流程,404(文件还不存在)时不带 sha,相当于自动建档。

## 前端交互模型:草稿 + 批量保存

打勾动作、心情/工作状态打分、加餐三个开关、备注文字,这些操作**只修改内存里的草稿(`app.js` 里的 `drafts` 对象,按日期分组),不会触发网络请求**。只有点了某一天卡片里的"保存修改"按钮,才会把这份草稿一次性写进 GitHub(一次请求,不是每次点击都请求)。

- `getDraft(dateStr)`:草稿不存在时,从当前已同步的数据里初始化一份。
- `saveDraft(dateStr)`:保存时先把草稿标记 `saving = true` 并锁住这张卡片(变暗 + 禁止再点,防止保存过程中又产生新的草稿去竞争同一次写入),网络请求结束后成功则清空草稿、失败则解锁草稿允许重试。
- 生理期打卡和"顺延"这两个操作**不走草稿**,点了就立刻同步——因为这两个是低频、一次性的决定,不是"慢慢勾选积累"的东西。

## 页面结构(`index.html` + `app.js` 的路由)

用 `location.hash` 做路由(`#today` / `#calendar` / `#period` / `#guide` / `#settings`),5 个 `<section id="view-*">` 常驻 DOM,只切换 `.active` 类控制显示。

1. **今天**——当天的训练卡片(展开态常驻)。
2. **日历**——月度网格(一眼看完成情况:□有氧/■力量/·顺延,已完成格子黑底,经期日左边粗边)+ 下面是可展开的按天详情列表,点网格格子会跳到列表里对应那天并展开。
3. **生理期**——记录经期开始日期、看平均周期长度和当前周期阶段估算。
4. **指南**——纯静态文案(6个月饮食/训练策略、早晚餐份量参考、生理周期调整建议),不依赖 JS 数据。
5. **设置**——填 GitHub owner/repo/branch/path/token,JSON 导入导出备份。

**"日历"和"今天"共用同一套 `dayCardHtml()` / `bindDayCards()` 逻辑**——同一张卡片模板,同一套事件委托处理函数,差别只是 Today 只渲染今天这一张、Calendar 渲染一整月并支持展开/收起。

⚠️ **`bindDayCards()` 只能在 `init()` 里对 `#view-today` / `#view-calendar` 各绑定一次**,不能放进 `renderToday()`/`renderCalendar()` 里——这两个容器元素本身从不被销毁重建(只有 `innerHTML` 会被替换),如果每次渲染都重新 `addEventListener`,旧的监听器不会被自动清除,点击几次后会有多个重复的处理函数同时响应同一次点击,互相打架(这是实际踩过的坑,历史提交里能查到)。

## 部署缓存的坑

GitHub Pages 对静态文件设置了约 10 分钟的浏览器缓存,而手机 Safari 没有真正的"强制刷新"手势。所以 `index.html` 里的 `<script src="js/app.js?v=N">`、`<link href="css/style.css?v=N">`,以及 `app.js` 内部对其他模块的 `import ... from './xxx.js?v=N'`,都带着同一个版本号查询参数。

**每次改完 JS/CSS 准备部署时,记得把这几处的 `?v=N` 统一 +1**(否则用户手机上可能继续用着缓存的旧代码,看起来像"改了但没生效"):

```bash
sed -i '' 's/?v=OLD/?v=NEW/g' index.html js/app.js
```

## 本地验证

没有构建步骤,但可以这样快速验证:

```bash
# 纯函数模块可以直接用 bun 跑逻辑测试(不需要浏览器)
bun run some-test.mjs   # import schedule.js / period.js / mood.js 直接测

# app.js 涉及 DOM,可以用 happy-dom 模拟浏览器环境测试
bun add happy-dom
# 用 new Window() 搭最简 DOM 骨架,import app.js,dispatchEvent 模拟点击

# 语法检查(注意 bun build 无法解析 ?v= 查询参数导入,要加 --external "*"）
bun build js/app.js --external "*" --outdir /tmp/check

# 起个静态服务器肉眼/curl 检查资源能否正常加载
python3 -m http.server 8080
```

## 一次性设置(新环境/新账号需要做的事)

1. GitHub 上创建两个仓库:`personal-record`(Public)、`personal-record-data`(Private)。
2. `personal-record` 仓库设置里开启 Pages:Source 选 "Deploy from a branch" → `main` / `(root)`。
3. 生成 fine-grained PAT:Repository access 只选 `personal-record-data`,Permissions → Contents 设为 **Read and write**,其余都不给。
4. 手机和电脑分别打开网页 → 设置页 → 填 owner/repo(`personal-record-data`)/branch(`main`)/path(`data.json`)/token。
