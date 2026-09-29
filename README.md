# Kube 游乐场

用小游戏理解 Kubernetes。纯静态网页，没有构建步骤、没有依赖。

## 运行

直接双击 `index.html` 就能玩。也可以起一个本地静态服务：

```bash
python3 -m http.server 8765
```

然后打开 <http://localhost:8765>。进度（星星）保存在浏览器 localStorage 里。

## 游戏一览

| # | 小游戏 | 玩法 | 对应的 K8s 概念 |
|---|---|---|---|
| 1 | 🧩 **调度大师** | 你来当 kube-scheduler：把 Pending 的 Pod 放到节点上。节点条形图显示 capacity / 系统预留 / allocatable，悬停时预览放上去的效果，放不下时给出和真实调度器一样的失败原因。还能让"默认调度器"按 LeastAllocated 打分跑一遍做对比。 | capacity vs allocatable、requests 占座、CPU/内存双维装箱、资源搁浅、Taint/Toleration、nodeSelector、DaemonSet、Cluster Autoscaler |
| 2 | 💥 **OOM 求生记** | 给每个 Pod 调 request / limit，然后模拟一整天（约 30 秒）。内存用量会随流量、泄漏、突发上涨，图表上实时标出 💥 OOMKilled、☠ 内核 OOM、⛔ 驱逐。 | request vs limit、QoS（Guaranteed / Burstable / BestEffort）、cgroup OOMKilled、CrashLoopBackOff 退避、kubelet 驱逐排序、内核 OOM Killer 与 oom_score_adj、CPU 权重与 CFS 节流 |
| 3 | 🎛️ **控制平面三连** | ① 标签选择器：写 selector 精确圈中目标 Pod，执行后才揭晓结果；② 我是 ReplicaSet：60 秒内手动维持副本数，应对误删、扩缩容、节点宕机、驱逐、容器崩溃；③ 滚动更新：调 maxSurge / maxUnavailable / readinessProbe，看流量粒子在 Service 和 Pod 之间流动。 | Label / Selector（matchLabels、In、NotIn、Exists）、Service、NetworkPolicy、PDB、控制循环、level-triggered、节点故障与 Pod 驱逐、Deployment 滚动更新、readinessProbe、回滚 |
| 4 | 🤖 **Operator 工坊** | ① 解剖图：6 个场景动画演示事件从 API Server 流经 Informer、WorkQueue 到 Reconcile 的全过程，点击组件看说明；② 我是 Reconciler：用代码卡片拼出 Reconcile 函数，同一段代码要经受多次触发；③ 概念连连看：24 个 Operator 概念配对。 | CRD / CR、Manager、Informer（Reflector / DeltaFIFO / Indexer）、EventHandler / Predicate、WorkQueue 去重与限速重试、Reconcile 返回值语义、幂等、level-triggered、ownerReferences 与 GC、Finalizer、Status 子资源 / observedGeneration、Admission Webhook、Leader Election、Resync |

## 设计要点

**1. 容器从节点占用 CPU / 内存**：做成"装箱"游戏。关键认知是：调度只看 requests，与实际用量无关；资源有多个维度，会互相卡住。每一关都故意设计成默认调度器（按队列顺序 + LeastAllocated）会失败、人动脑子能成功的局面。

**2. request / limit 与运行中的 OOM**：做成"先配置、再模拟"的解谜（类似造桥游戏）。模拟内核在 `js/g2-sim.js`，行为贴近真实：

- 用量超过 limit：cgroup OOMKilled，重启间隔按指数退避，连续失败就是 CrashLoopBackOff
- 节点可用内存低于驱逐阈值：kubelet 驱逐 Pod，排序依据是：是否超过 request、超出多少
- 节点内存被瞬间打满：内核 OOM Killer 按 `oom_score = 内存占比×1000 + oom_score_adj` 挑进程
- CPU：按 request 比例分配（cpu.weight），超过 limit 就被节流，不会被杀

**3. 其他 K8s 概念**：选了三个最能用"玩"来体会的主题：选择器语义（尤其是 NotIn 会匹配缺失的标签）、控制循环（期望 vs 实际）、滚动更新（发布策略 + 就绪探针）。

**4. Operator 的各类概念**：分三层递进。先看（架构动画），再做（写 Reconcile），最后记（连连看）。Reconciler 解谜里专门埋了几个真实世界常见的坑：用 `Create` 导致的 AlreadyExists 死循环、`CreateOrUpdate` 每次都重新生成密码、用 `r.Update` 写 status、先移除 finalizer 再清理外部资源、吞掉错误导致不再重试。

## 目录结构

```
index.html            入口
css/style.css         样式（跟随系统浅色 / 深色）
js/core.js            DOM 工具、路由、存档、弹窗等公共组件
js/g1-scheduler.js    游戏 1
js/g2-sim.js          游戏 2 的模拟内核（纯逻辑，可在 Node 中测试）
js/g2-resources.js    游戏 2 界面
js/g3-concepts.js     游戏 3（三个小游戏）
js/g4-operator.js     游戏 4（三个小游戏）
test/                 关卡平衡与解谜可解性测试
```

## 测试

```bash
node test/g2-sim.test.js && node test/g4-reconciler.test.js
```

测试会确认：OOM 关卡的初始配置拿 0 星、参考答案能拿 3 星；每个 Reconciler 关卡都有解，而且每个陷阱都会被判定出来；每个选择器关卡都存在正确答案。

`node test/g1-timed.sim.js [起始间隔] [最终间隔] [最短运行] [运行浮动]` 用机器人玩家模拟"高峰时段"关，调难度时用。

## 部署

线上地址：https://k8s-game.nphunter.gg

- **基础设施**：`infra/`（Pulumi TypeScript，stack `illidan53/kgame-infra/prod`），和 nphunter.gg 在同一个 AWS 账号（`nphunter-sso` profile，us-east-1）。做法与 global-network.nphunter.gg 相同：
  - 私有 S3 桶 `kgame-k8s-game`，只能经 CloudFront OAC 读取；
  - CloudFront 分发 `E4U3ZYIS50NY8`，使用托管的 CachingOptimized 和 SecurityHeaders 策略；
  - ACM 证书用 DNS 验证；
  - 只在 Route 53 的 `nphunter.gg` 托管区里添加本子域名的 A / AAAA 别名记录和证书验证记录。

  ```bash
  cd infra && npm ci && AWS_PROFILE=nphunter-sso pulumi up -s illidan53/kgame-infra/prod
  ```

- **发布**：`scripts/deploy.sh` 会依次执行：
  1. 测试；
  2. `scripts/build.mjs` 生成 `dist/`，JS / CSS 文件名带内容哈希，长缓存 immutable；`index.html` 每次重新验证；
  3. 上传 S3，先传资源再传 `index.html`；
  4. 让 CloudFront 失效，然后对线上地址做冒烟测试。

  ```bash
  aws sso login --profile nphunter-sso
  ./scripts/deploy.sh
  ```
# kgame
