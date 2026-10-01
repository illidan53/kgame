/* 小游戏 4：Operator 工坊 —— 架构解剖（可视化）/ 我是 Reconciler（编程解谜）/ 概念连连看 */
(function () {
  'use strict';
  const { h, s } = KG;
  const GAME = 'operator';

  // ================================================================ 4a 架构解剖
  const BOX = {
    user: { x: 20, y: 20, w: 150, h: 56, t: '👤 用户 / CI', sub: 'kubectl apply' },
    api: { x: 20, y: 120, w: 150, h: 120, t: 'API Server', sub: '认证 · 准入 · 存储 · Watch' },
    etcd: { x: 45, y: 280, w: 100, h: 52, t: 'etcd', sub: '持久化' },
    op: { x: 205, y: 20, w: 550, h: 560, t: 'Operator 进程 · controller-runtime Manager', group: true },
    informer: { x: 225, y: 60, w: 240, h: 200, t: 'Informer（共享缓存）', group: true },
    reflector: { x: 240, y: 95, w: 210, h: 40, t: 'Reflector', sub: 'List & Watch' },
    fifo: { x: 240, y: 148, w: 210, h: 40, t: 'DeltaFIFO', sub: '按对象排队的变化' },
    cache: { x: 240, y: 201, w: 210, h: 40, t: 'Indexer', sub: '本地缓存' },
    handler: { x: 495, y: 70, w: 240, h: 56, t: 'EventHandler + Predicate', sub: '事件 → key' },
    queue: { x: 495, y: 160, w: 240, h: 100, t: 'WorkQueue', sub: '去重 · 限速重试' },
    webhook: { x: 225, y: 300, w: 130, h: 100, t: 'Webhook Server', sub: '默认值 / 校验' },
    reconciler: { x: 375, y: 300, w: 360, h: 100, t: 'Reconciler.Reconcile(ctx, req)', sub: '' },
    client: { x: 225, y: 440, w: 240, h: 56, t: 'Client', sub: '读走缓存，写直达 API' },
    leader: { x: 495, y: 440, w: 240, h: 56, t: 'Leader Election', sub: 'Lease 锁' },
    objs: { x: 775, y: 20, w: 210, h: 330, t: 'API 中的对象', group: true },
    cr: { x: 790, y: 55, w: 180, h: 110, t: 'Database/mydb', sub: '' },
    sts: { x: 790, y: 180, w: 180, h: 44, t: 'StatefulSet/mydb', sub: '' },
    svc: { x: 790, y: 234, w: 180, h: 44, t: 'Service/mydb', sub: '' },
    secret: { x: 790, y: 288, w: 180, h: 44, t: 'Secret/mydb-cred', sub: '' },
    ext: { x: 775, y: 420, w: 210, h: 80, t: '☁ 外部系统', sub: '云存储桶 mydb-backup' },
  };

  const INFO = {
    user: ['用户 / CI', '用户、CI 流水线或 GitOps 工具（Argo CD、Flux）通过 kubectl / Helm 提交<b>期望状态</b>（YAML）。他们只说"要什么"，不说"怎么做"。'],
    api: ['API Server', '集群的唯一入口，负责认证、鉴权、<b>准入（Admission）</b>、写入 etcd，并通过 <b>Watch</b> 长连接把变化推给所有客户端。所有组件（包括 Operator）都只和它打交道，彼此不直接通信。'],
    etcd: ['etcd', '所有对象的持久化存储。每次写入 <code>resourceVersion</code> 都会递增；只有修改 spec 时 <code>metadata.generation</code> 才 +1（改 status 不会）。'],
    op: ['Manager', '<code>ctrl.NewManager()</code> 创建的"总管"：持有共享的 <b>Cache</b>、<b>Client</b>、<b>Scheme</b>，负责启动所有 Controller 和 Webhook Server，还负责选主、metrics、健康检查。<code>mgr.Start(ctx)</code> 之后一切开始运转。'],
    informer: ['Informer / Cache', 'Informer = Reflector + DeltaFIFO + Indexer。controller-runtime 的 <code>cache.Cache</code> 为每种 GVK 维护一个 SharedIndexInformer，同一个 Manager 里的控制器共享它，避免重复 Watch、减轻 API Server 压力。'],
    reflector: ['Reflector', '先 <b>List</b> 全量，再从返回的 resourceVersion 开始 <b>Watch</b> 增量（ADDED / MODIFIED / DELETED）。断线自动重连；resourceVersion 太旧（410 Gone）时重新 List。'],
    fifo: ['DeltaFIFO', '按对象 key 累积变化（Deltas），保证同一个对象的变化按顺序处理，交给 Informer 更新缓存并分发事件。'],
    cache: ['Indexer（本地缓存）', '线程安全的内存缓存，支持自定义索引（<code>IndexField</code>）。<code>client.Get / List</code> 默认读这里：快，但可能比 API Server 稍旧一点（最终一致）。'],
    handler: ['EventHandler + Predicate', '把事件转换成 <code>reconcile.Request</code>（只有 namespace/name）。<br>• <code>For(&Database{})</code> → EnqueueRequestForObject<br>• <code>Owns(&StatefulSet{})</code> → EnqueueRequestForOwner（顺着 ownerReference 找到父对象）<br>• <code>Watches(…, EnqueueRequestsFromMapFunc)</code> → 自定义映射<br><b>Predicate</b>（如 <code>GenerationChangedPredicate</code>）在入队前过滤事件。'],
    queue: ['WorkQueue', '<code>workqueue.TypedRateLimitingInterface</code><br>• <b>去重</b>：同一个 key 在队列里只存一份<br>• <b>不并发</b>：正在处理的 key 又来了事件，会先标记为 dirty，处理完再重新入队<br>• <b>限速重试</b>：<code>AddRateLimited</code> 按指数退避，5ms → 10ms → … 最长 1000s，外加整体令牌桶限速'],
    webhook: ['Admission Webhook', 'API Server 在对象写入 etcd <b>之前</b>调用：<br>• <b>Mutating</b>：改请求，比如填默认值（<code>admission.CustomDefaulter</code>）<br>• <b>Validating</b>：拒绝非法请求（<code>admission.CustomValidator</code>）<br>• <b>Conversion</b>：CRD 多版本之间转换<br>由 Manager 内置的 webhook server 通过 HTTPS 提供。'],
    reconciler: ['Reconciler', '你写的业务逻辑：<code>Reconcile(ctx, req) (ctrl.Result, error)</code>。<br>• 只拿到 key，需要自己 Get 最新状态<br>• 必须<b>幂等</b>，任何时候重复执行都安全<br>• 返回值决定后续：<code>error</code> → 限速重试；<code>RequeueAfter</code> → 定时再来；<code>Result{}</code> → Forget，等下一个事件<br>• <code>MaxConcurrentReconciles</code> 控制 worker 数量'],
    client: ['Client', '<code>client.Client</code>：读（Get / List）默认走缓存，写（Create / Update / Patch / Delete）直达 API Server。<br>常用辅助函数：<code>Status().Update</code>（写 status 子资源）、<code>controllerutil.CreateOrUpdate</code>、<code>SetControllerReference</code>、<code>AddFinalizer / RemoveFinalizer</code>。'],
    leader: ['Leader Election', '多副本部署 Operator 时，通过 <code>coordination.k8s.io/v1</code> 的 <b>Lease</b> 对象选主，只有 leader 运行控制器，避免两个副本同时改同一个对象（Webhook 所有副本都可以提供服务）。开启方式：<code>ctrl.Options{LeaderElection: true}</code>。'],
    objs: ['API 中的对象', '这些对象都存在 etcd 里，通过 API Server 访问。自定义资源（CR）和内置资源（StatefulSet、Service…）在 API 层面是平等的。'],
    cr: ['自定义资源（CR）', '由 <b>CRD</b> 定义的类型的实例。<b>spec</b> 是用户写的期望状态，<b>status</b> 是控制器写的观察结果（status 子资源）。<br>Go 类型：<code>type Database struct { metav1.TypeMeta; metav1.ObjectMeta; Spec DatabaseSpec; Status DatabaseStatus }</code>，通过 <code>SchemeBuilder.Register</code> 注册到 <b>Scheme</b>，kubebuilder 的 <code>// +kubebuilder:</code> 注释生成 CRD YAML 和 DeepCopy 代码。'],
    sts: ['子资源 StatefulSet', 'Operator 创建的子资源，<code>ownerReferences</code> 指向 Database/mydb（<code>controller: true</code>）。owner 被删除时由<b>垃圾回收器</b>级联删除；它的变化会通过 <code>Owns()</code> 触发父对象的 Reconcile。'],
    svc: ['子资源 Service', '同样带 ownerReference。如果有人手动删掉它，Operator 会在下一次 Reconcile 中把它建回来（漂移修复）。'],
    secret: ['子资源 Secret', '存放数据库密码。注意幂等：不要每次 Reconcile 都重新生成随机密码！'],
    ext: ['外部系统', '集群外的资源（云存储、DNS 记录、数据库账号……）。K8s 的 GC 管不到它们，所以需要 <b>finalizer</b>：删除 CR 时 Operator 先清理这些资源，再移除 finalizer。'],
  };

  const INIT = {
    none: () => ({ cr: null, sts: null, svc: false, secret: false, bucket: false, queue: [], qnote: '', rtext: '等待 key…' }),
    ready: (extra) => Object.assign({ cr: { gen: 1, replicas: 3, phase: 'Ready', observed: 1, finalizers: [], deleting: false, backup: false }, sts: { replicas: 3 }, svc: true, secret: true, bucket: false, queue: [], qnote: '', rtext: '等待 key…' }, extra || {}),
  };
  const step = (from, to, label, text, fx) => ({ from, to, label, text, fx });

  const SCENARIOS = [
    {
      id: 'create',
      title: '① 创建 CR',
      init: INIT.none,
      steps: [
        step('user', 'api', 'apply', '用户执行 <code>kubectl apply -f mydb.yaml</code>，提交一个 <code>kind: Database</code> 对象。API Server 认识这个类型，是因为事先安装了它的 <b>CRD</b>（CustomResourceDefinition）。'),
        step('api', 'webhook', 'admission', 'API Server 先调用 Operator 提供的 <b>Mutating Webhook</b> 填默认值（比如 <code>replicas: 3</code>），再调用 <b>Validating Webhook</b> 做校验（比如版本必须 ≥ 13）。'),
        step('webhook', 'api', 'allowed ✓', 'Webhook 返回 <code>allowed: true</code>。如果返回 false，<code>kubectl apply</code> 会直接报错，对象根本不会被创建。'),
        step('api', 'etcd', 'persist', '对象写入 etcd，<code>metadata.generation = 1</code>。', (S) => (S.cr = { gen: 1, replicas: 3, phase: '', observed: 0, finalizers: [], deleting: false })),
        step('api', 'reflector', 'ADDED', 'Informer 里的 <b>Reflector</b> 一直挂着 Watch 长连接，马上收到 <code>ADDED Database/mydb</code> 事件。'),
        step('reflector', 'fifo', 'Delta', '变化以 Delta 的形式进入 <b>DeltaFIFO</b>。'),
        step('fifo', 'cache', 'store', 'Informer 取出 Delta，更新本地缓存 <b>Indexer</b>。之后控制器读这个对象，读的就是这里。'),
        step('cache', 'handler', 'OnAdd', '触发 <b>EventHandler</b>。Predicate 可以在这里过滤掉不关心的事件。'),
        step('handler', 'queue', 'default/mydb', '入队的只是一个 key：<code>default/mydb</code>。不是整个对象，也不是事件本身。', (S) => S.queue.push('default/mydb')),
        step('queue', 'reconciler', 'req', 'Worker 从队列取出 key，调用 <code>Reconcile(ctx, req)</code>。同一个 key 同一时刻只会被一个 worker 处理。', (S) => {
          S.queue.shift();
          S.rtext = 'Reconcile(default/mydb)';
        }),
        step('reconciler', 'cache', 'Get', '<code>r.Get(ctx, req.NamespacedName, &db)</code>：从本地缓存读对象，不打 API Server。', (S) => (S.rtext = 'r.Get → spec.replicas=3')),
        step('reconciler', 'client', 'Create ×3', '对比期望（spec）和实际（什么都还没有）：要创建 StatefulSet、Service、Secret，并用 <code>SetControllerReference</code> 把它们的 ownerReferences 指向 mydb。', (S) => (S.rtext = '创建子资源 + ownerReferences')),
        step('client', 'api', 'POST', '写操作通过 Client 直达 API Server。', (S) => {
          S.sts = { replicas: 3 };
          S.svc = true;
          S.secret = true;
        }),
        step('reconciler', 'client', 'Status()', '<code>r.Status().Update(ctx, &db)</code>：写入 <code>status.observedGeneration=1</code>、<code>phase=Creating</code>。status 是子资源，要单独更新。', (S) => (S.rtext = 'r.Status().Update')),
        step('client', 'api', 'PUT /status', '更新 status 不会让 generation 增加。', (S) => {
          S.cr.phase = 'Creating';
          S.cr.observed = 1;
        }),
        step('reconciler', 'queue', 'Forget', '返回 <code>ctrl.Result{}, nil</code>：队列调用 <code>Forget</code> 清空这个 key 的重试计数，再调用 <code>Done</code>。', (S) => (S.rtext = 'return ctrl.Result{}, nil')),
        step('api', 'reflector', 'ADDED sts', '刚创建的 StatefulSet 也产生了 Watch 事件，因为 Operator 通过 <code>Owns(&appsv1.StatefulSet{})</code> 监听了它。'),
        step('cache', 'handler', 'OnAdd(sts)', '这个事件交给 <b>EnqueueRequestForOwner</b> 处理。'),
        step('handler', 'queue', 'default/mydb', '它顺着 ownerReference 找到父对象，入队的依然是 <code>default/mydb</code>。', (S) => S.queue.push('default/mydb')),
        step('queue', 'reconciler', 'req', '再次 Reconcile：Get、比较，发现子资源都已经存在，只需要把 StatefulSet 的 readyReplicas 同步到 status。这就是<b>幂等</b>：同一个 Reconcile 执行多少次都安全。', (S) => {
          S.queue.shift();
          S.rtext = '一切就绪，只同步 status';
        }),
        step('reconciler', 'client', 'Status()', '更新 <code>status.phase=Ready</code>，这一轮结束。', (S) => (S.cr.phase = 'Ready')),
      ],
    },
    {
      id: 'dedupe',
      title: '② 连改三次',
      init: () => INIT.ready(),
      steps: [
        step('user', 'api', 'replicas: 4', '用户连续改了三次 <code>spec.replicas</code>：4、5、6。每次修改 spec，generation 都 +1。', (S) => Object.assign(S.cr, { gen: 2, replicas: 4 })),
        step('user', 'api', 'replicas: 5', '', (S) => Object.assign(S.cr, { gen: 3, replicas: 5 })),
        step('user', 'api', 'replicas: 6', '', (S) => Object.assign(S.cr, { gen: 4, replicas: 6 })),
        step('api', 'reflector', 'MODIFIED ×3', 'Informer 收到 3 个 MODIFIED 事件，缓存被更新到最新版本。'),
        step('cache', 'handler', 'OnUpdate ×3', 'EventHandler 被调用了 3 次……'),
        step('handler', 'queue', 'key ×3', '……但 WorkQueue 会<b>去重</b>：<code>default/mydb</code> 已经在队列里了，后两次 Add 什么也不做。', (S) => {
          S.queue = ['default/mydb'];
          S.qnote = '3 次 Add → 1 个 key';
        }),
        step('queue', 'reconciler', 'req', '结果只跑了一次 Reconcile。', (S) => {
          S.queue.shift();
          S.qnote = '';
          S.rtext = 'Reconcile(default/mydb)';
        }),
        step('reconciler', 'cache', 'Get', 'Get 读到的是<b>最新</b>状态 <code>replicas: 6</code>。控制器完全不需要知道中间有过 4 和 5，这就是 <b>level-triggered</b>：只看当前状态，不看事件历史。', (S) => (S.rtext = 'r.Get → replicas=6')),
        step('reconciler', 'client', 'Patch sts', '把 StatefulSet 的 replicas 改成 6。', (S) => (S.rtext = 'CreateOrUpdate StatefulSet')),
        step('client', 'api', 'PATCH', '', (S) => (S.sts = { replicas: 6 })),
        step('reconciler', 'client', 'Status()', '写入 <code>status.observedGeneration=4</code>，表示"最新一版 spec 我已经处理过了"。用户可以用它判断变更是否生效。', (S) => {
          S.cr.observed = 4;
          S.rtext = 'return ctrl.Result{}, nil';
        }),
      ],
    },
    {
      id: 'drift',
      title: '③ 漂移修复',
      init: () => INIT.ready(),
      steps: [
        step('user', 'api', 'delete svc', '有人手滑执行了 <code>kubectl delete svc mydb</code>。', (S) => (S.svc = false)),
        step('api', 'reflector', 'DELETED', 'Informer 收到 <code>DELETED Service/mydb</code>。'),
        step('cache', 'handler', 'OnDelete', '因为 Operator 声明了 <code>Owns(&corev1.Service{})</code>，这个事件由 EnqueueRequestForOwner 处理。'),
        step('handler', 'queue', 'default/mydb', '它读取被删 Service 的 ownerReference，入队 <code>default/mydb</code>。', (S) => S.queue.push('default/mydb')),
        step('queue', 'reconciler', 'req', 'Reconcile 只拿到一个 key。它不知道也不关心刚才是谁删了什么。', (S) => {
          S.queue.shift();
          S.rtext = 'Reconcile(default/mydb)';
        }),
        step('reconciler', 'cache', 'Get / List', '读取 Database 和它的子资源，发现 Service 没了。', (S) => (S.rtext = '对比：Service 缺失')),
        step('reconciler', 'client', 'CreateOrUpdate', '用 <code>CreateOrUpdate</code> 把每个子资源都对齐一遍：Service 缺失，就重新创建。', (S) => (S.rtext = 'CreateOrUpdate ×3')),
        step('client', 'api', 'POST', '漂移被纠正，实际状态又回到了期望状态。<b>自愈</b>靠的就是这个循环。', (S) => {
          S.svc = true;
          S.rtext = 'return ctrl.Result{}, nil';
        }),
      ],
    },
    {
      id: 'retry',
      title: '④ 出错重试',
      init: () => INIT.ready(),
      steps: [
        step('user', 'api', 'backup: true', '用户给数据库打开了备份：<code>spec.backup: true</code>。', (S) => Object.assign(S.cr, { gen: 2, backup: true })),
        step('api', 'reflector', 'MODIFIED', ''),
        step('handler', 'queue', 'default/mydb', '', (S) => S.queue.push('default/mydb')),
        step('queue', 'reconciler', 'req', '', (S) => {
          S.queue.shift();
          S.rtext = 'Reconcile(default/mydb)';
        }),
        step('reconciler', 'ext', 'CreateBucket', '调用云厂商 API 创建备份存储桶。', (S) => (S.rtext = 'cloud.EnsureBucket()')),
        step('ext', 'reconciler', '503', '云 API 返回 <code>503 Too Many Requests</code>。', (S) => (S.rtext = 'err: 503')),
        step('reconciler', 'queue', 'AddRateLimited', '<code>return ctrl.Result{}, err</code>：队列按指数退避把 key 重新放回去，<b>5ms</b> 后重试。', (S) => {
          S.queue.push('default/mydb');
          S.qnote = '重试 #1 · 等 5ms';
        }),
        step('queue', 'reconciler', 'retry', '', (S) => {
          S.queue.shift();
          S.rtext = '重试 #1';
        }),
        step('reconciler', 'ext', 'CreateBucket', ''),
        step('ext', 'reconciler', '503', '又失败了。'),
        step('reconciler', 'queue', 'AddRateLimited', '这次等 <b>10ms</b>（5ms × 2ⁿ，最长 1000 秒；另外还有整体 10 qps 的令牌桶限速）。', (S) => {
          S.queue.push('default/mydb');
          S.qnote = '重试 #2 · 等 10ms';
        }),
        step('queue', 'reconciler', 'retry', '', (S) => {
          S.queue.shift();
          S.rtext = '重试 #2';
        }),
        step('reconciler', 'ext', 'CreateBucket', ''),
        step('ext', 'reconciler', '200 OK', '成功了！', (S) => {
          S.bucket = true;
          S.rtext = '存储桶已创建';
        }),
        step('reconciler', 'client', 'Status()', '更新 status：observedGeneration=2，Condition <code>BackupReady=True</code>。', (S) => (S.cr.observed = 2)),
        step('reconciler', 'queue', 'Forget', '成功后调用 <code>Forget(key)</code>，重试计数清零。<br>⚠️ 如果出错时只打日志、返回 nil，这个 key 就不会再被处理，要等到下一次事件或 resync。', (S) => {
          S.qnote = '';
          S.rtext = 'return ctrl.Result{}, nil';
        }),
      ],
    },
    {
      id: 'delete',
      title: '⑤ 删除与 Finalizer',
      init: () => INIT.ready({ bucket: true, cr: { gen: 2, replicas: 3, phase: 'Ready', observed: 2, finalizers: ['cleanup'], deleting: false, backup: true } }),
      steps: [
        step('user', 'api', 'delete', '用户执行 <code>kubectl delete database mydb</code>。'),
        step('api', 'etcd', 'deletionTimestamp', '对象上还挂着 finalizer <code>db.example.com/cleanup</code>，所以 API Server <b>不会真删</b>，只是设置 <code>metadata.deletionTimestamp</code>，对象进入 Terminating 状态。', (S) => (S.cr.deleting = true)),
        step('api', 'reflector', 'MODIFIED', '设置 deletionTimestamp 也是一次更新，Informer 收到 MODIFIED。'),
        step('handler', 'queue', 'default/mydb', '', (S) => S.queue.push('default/mydb')),
        step('queue', 'reconciler', 'req', '', (S) => {
          S.queue.shift();
          S.rtext = 'Reconcile(default/mydb)';
        }),
        step('reconciler', 'cache', 'Get', 'Get 发现 <code>!db.DeletionTimestamp.IsZero()</code>，进入清理分支。', (S) => (S.rtext = '正在删除 → 清理分支')),
        step('reconciler', 'ext', 'DeleteBucket', '先清理集群外的资源：删除云存储桶（K8s 的 GC 管不到它）。', (S) => (S.rtext = 'cloud.DeleteBucket()')),
        step('ext', 'reconciler', 'OK', '', (S) => (S.bucket = false)),
        step('reconciler', 'client', 'RemoveFinalizer', '清理成功后，再 <code>RemoveFinalizer</code> + <code>Update</code>。顺序很重要：如果先移除 finalizer，一旦清理失败，就再也没有重试的机会了。', (S) => (S.rtext = 'RemoveFinalizer + Update')),
        step('client', 'api', 'PUT', '', (S) => (S.cr.finalizers = [])),
        step('api', 'etcd', 'delete', 'finalizers 空了，又有 deletionTimestamp，对象被真正删除。', (S) => (S.cr = null)),
        step('api', 'sts', 'GC', '<b>垃圾回收器</b>发现 StatefulSet、Service、Secret 的 owner 不在了，按 ownerReferences 级联删除（默认 Background 策略）。Operator 不需要自己删它们。', (S) => {
          S.sts = null;
          S.svc = false;
          S.secret = false;
        }),
        step('api', 'reflector', 'DELETED', '最后一个 DELETED 事件入队，Reconcile 中 Get 返回 NotFound，用 <code>client.IgnoreNotFound(err)</code> 直接返回。', (S) => (S.rtext = 'NotFound → 结束')),
      ],
    },
    {
      id: 'startup',
      title: '⑥ 启动与选主',
      init: () => INIT.ready({ rtext: '（Operator 刚启动）' }),
      steps: [
        step('leader', 'api', 'Lease', 'Operator 以 2 个副本部署。启动后先去抢 <code>Lease</code> 锁（coordination.k8s.io/v1），抢到的成为 leader，其余副本待命；leader 挂了，会有别的副本接替。'),
        step('api', 'leader', 'acquired', '拿到锁，开始运行控制器。（Webhook server 所有副本都会运行。）'),
        step('reflector', 'api', 'LIST', 'Reflector 先 <b>List</b> 全量：所有 Database、StatefulSet、Service……'),
        step('api', 'reflector', 'items + RV', '返回全量对象和一个 resourceVersion，之后就从这个版本开始 Watch。'),
        step('fifo', 'cache', 'sync', '缓存填满。<code>WaitForCacheSync</code> 完成之前，控制器不会开始处理。'),
        step('handler', 'queue', 'N 个 key', '每个现存对象都会触发一次 OnAdd，全部入队。', (S) => {
          S.queue = ['default/mydb', 'prod/orders', 'prod/users'];
        }),
        step('queue', 'reconciler', 'reconcile', '逐个 Reconcile。因为逻辑是 level-triggered 且幂等，即使状态本来就是对的，重复执行也没有副作用。Operator 重启期间错过的事件，也就无所谓了。', (S) => {
          S.queue = [];
          S.rtext = '逐个对账：状态已一致';
        }),
        step('handler', 'queue', 'resync', '另外还可以配置 <code>SyncPeriod</code>（默认约 10 小时），定期把所有对象再入队一遍，兜底任何遗漏。', (S) => {
          S.qnote = '定期 resync';
        }),
      ],
    },
  ];

  function center(b) {
    return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
  }
  function edgePoint(b, tx, ty) {
    const c = center(b);
    const dx = tx - c.x;
    const dy = ty - c.y;
    if (!dx && !dy) return c;
    const sx = dx ? b.w / 2 / Math.abs(dx) : Infinity;
    const sy = dy ? b.h / 2 / Math.abs(dy) : Infinity;
    const k = Math.min(sx, sy);
    return { x: c.x + dx * k, y: c.y + dy * k };
  }

  function mountAnatomy(host) {
    const sc = KG.scope();
    let scIdx = 0;
    let S;
    let stepIdx = -1;
    let playing = false;
    let anim = null; // {from,to,t,dur,label,cb}
    let waitT = 0;
    let speed = 1;
    let selected = 'reconciler';

    const svg = s('svg', { class: 'g4a-svg', viewBox: '0 0 1000 600', role: 'img', 'aria-label': 'Operator 架构图' });
    const boxEls = {};
    const lines = [
      ['user', 'api'],
      ['api', 'etcd'],
      ['api', 'webhook'],
      ['api', 'reflector'],
      ['reflector', 'fifo'],
      ['fifo', 'cache'],
      ['cache', 'handler'],
      ['handler', 'queue'],
      ['queue', 'reconciler'],
      ['reconciler', 'client'],
      ['client', 'api'],
      ['reconciler', 'ext'],
      ['leader', 'api'],
    ];
    const gLines = s('g', { class: 'g4a-lines' });
    for (const [a, b] of lines) {
      const A = BOX[a];
      const B = BOX[b];
      const p1 = edgePoint(A, center(B).x, center(B).y);
      const p2 = edgePoint(B, center(A).x, center(A).y);
      gLines.appendChild(s('line', { x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y }));
    }
    // ownerReference 虚线
    for (const k of ['sts', 'svc', 'secret']) {
      const b = BOX[k];
      gLines.appendChild(s('path', { class: 'owner', d: `M${b.x + 6},${b.y + b.h / 2} C${b.x - 14},${b.y + b.h / 2} ${BOX.cr.x - 14},${BOX.cr.y + BOX.cr.h - 20} ${BOX.cr.x + 4},${BOX.cr.y + BOX.cr.h - 16}` }));
    }
    svg.appendChild(gLines);
    const order = ['op', 'informer', 'objs', ...Object.keys(BOX).filter((k) => !['op', 'informer', 'objs'].includes(k))];
    for (const id of order) {
      const b = BOX[id];
      const g = s('g', { class: 'g4a-box' + (b.group ? ' group' : '') + ' b-' + id, tabindex: 0, role: 'button', 'aria-label': b.t, onclick: () => select(id), onkeydown: (e) => (e.key === 'Enter' || e.key === ' ') && select(id) });
      g.appendChild(s('rect', { x: b.x, y: b.y, width: b.w, height: b.h, rx: b.group ? 14 : 9 }));
      if (b.group) {
        g.appendChild(s('text', { x: b.x + 12, y: b.y + 20, class: 'gt', text: b.t }));
      } else {
        g.appendChild(s('text', { x: b.x + b.w / 2, y: b.y + (b.sub || id === 'cr' || id === 'queue' || id === 'reconciler' ? 22 : b.h / 2 + 5), class: 't', 'text-anchor': 'middle', text: b.t }));
        const sub = s('text', { x: b.x + b.w / 2, y: b.y + 40, class: 'st', 'text-anchor': 'middle', text: b.sub || '' });
        g.appendChild(sub);
        g._sub = sub;
        if (id === 'cr') {
          g._lines = [0, 1, 2].map((i) => {
            const t = s('text', { x: b.x + 12, y: b.y + 44 + i * 19, class: 'st mono-s', text: '' });
            g.appendChild(t);
            return t;
          });
          sub.remove();
        }
        if (id === 'queue') {
          g._slots = s('g');
          g.appendChild(g._slots);
          g._note = s('text', { x: b.x + b.w / 2, y: b.y + b.h - 10, class: 'st warn', 'text-anchor': 'middle', text: '' });
          g.appendChild(g._note);
          sub.setAttribute('y', b.y + 40);
        }
        if (id === 'reconciler') {
          g._code = s('text', { x: b.x + b.w / 2, y: b.y + 66, class: 'code-t', 'text-anchor': 'middle', text: '' });
          g.appendChild(g._code);
        }
      }
      boxEls[id] = g;
      svg.appendChild(g);
    }
    const token = s('g', { class: 'g4a-token', style: 'display:none' });
    const tokenC = s('circle', { r: 9 });
    const tokenT = s('text', { x: 14, y: 4, class: 'tk' });
    token.append(tokenC, tokenT);
    svg.appendChild(token);

    const narr = h('div', { class: 'g4a-narr prose' });
    const stepNo = h('span', { class: 'muted-text' });
    const info = h('div', { class: 'g4a-info' });
    const ctrl = h('div', { class: 'row gap wrap' });
    const scTabs = h('div', { class: 'g4a-sctabs' });

    function select(id) {
      selected = id;
      const [title, html] = INFO[id] || [id, ''];
      KG.fill(info, h('div', { class: 'panel-title' }, '🔎 ' + title), h('div', { class: 'prose', html }));
      Object.entries(boxEls).forEach(([k, g]) => g.classList.toggle('selected', k === id));
    }

    function renderState() {
      const cr = boxEls.cr;
      if (S.cr) {
        cr.classList.remove('gone');
        cr._lines[0].textContent = `spec.replicas: ${S.cr.replicas}  gen: ${S.cr.gen}`;
        cr._lines[1].textContent = `status: ${S.cr.phase || '—'} (obs ${S.cr.observed})`;
        cr._lines[2].textContent = S.cr.deleting ? `⚠ Terminating ${S.cr.finalizers.length ? '[cleanup]' : ''}` : `finalizers: [${S.cr.finalizers.join(', ')}]`;
        cr.classList.toggle('deleting', !!S.cr.deleting);
      } else {
        cr.classList.add('gone');
        cr.classList.remove('deleting');
        cr._lines[0].textContent = '（不存在）';
        cr._lines[1].textContent = '';
        cr._lines[2].textContent = '';
      }
      boxEls.sts.classList.toggle('gone', !S.sts);
      boxEls.sts._sub.textContent = S.sts ? `replicas: ${S.sts.replicas}` : '（不存在）';
      boxEls.svc.classList.toggle('gone', !S.svc);
      boxEls.svc._sub.textContent = S.svc ? 'ClusterIP' : '（不存在）';
      boxEls.secret.classList.toggle('gone', !S.secret);
      boxEls.secret._sub.textContent = S.secret ? 'password: ●●●●' : '（不存在）';
      boxEls.ext.classList.toggle('gone', !S.bucket);
      boxEls.ext._sub.textContent = S.bucket ? '存储桶 mydb-backup ✓' : '（没有存储桶）';
      const q = boxEls.queue;
      KG.clear(q._slots);
      const b = BOX.queue;
      if (!S.queue.length) q._slots.appendChild(s('text', { x: b.x + b.w / 2, y: b.y + 66, class: 'st', 'text-anchor': 'middle', text: '（空）' }));
      S.queue.slice(0, 3).forEach((k, i) => {
        const w = 70;
        const x = b.x + 10 + i * (w + 6);
        q._slots.appendChild(s('rect', { x, y: b.y + 50, width: w, height: 24, rx: 5, class: 'slot' }));
        q._slots.appendChild(s('text', { x: x + w / 2, y: b.y + 66, class: 'slot-t', 'text-anchor': 'middle', text: k.length > 11 ? k.slice(0, 10) + '…' : k }));
      });
      q._note.textContent = S.qnote || '';
      boxEls.reconciler._code.textContent = S.rtext || '';
    }

    function setScenario(i) {
      scIdx = i;
      S = SCENARIOS[i].init();
      stepIdx = -1;
      anim = null;
      playing = false;
      token.style.display = 'none';
      Object.values(boxEls).forEach((g) => g.classList.remove('active'));
      KG.fill(narr, h('p', { class: 'muted-text' }, '点 ▶ 播放，或者一步步点"下一步"。点图上任意组件，可以查看它的说明和对应的 controller-runtime 类型。'));
      stepNo.textContent = `0 / ${SCENARIOS[i].steps.length}`;
      KG.fill(scTabs, SCENARIOS.map((x, k) => h('button', { class: 'btn small' + (k === i ? ' active' : ''), onclick: () => setScenario(k) }, x.title)));
      renderState();
      renderCtrl();
    }

    function nextStep() {
      const sc2 = SCENARIOS[scIdx];
      if (anim) {
        // 动画还没走完就点了下一步：直接落地，再继续
        const cb = anim.cb;
        token.setAttribute('transform', `translate(${anim.p2.x},${anim.p2.y})`);
        anim = null;
        cb();
      }
      if (stepIdx + 1 >= sc2.steps.length) {
        playing = false;
        renderCtrl();
        return;
      }
      stepIdx++;
      const st = sc2.steps[stepIdx];
      stepNo.textContent = `${stepIdx + 1} / ${sc2.steps.length}`;
      if (st.text) KG.fill(narr, h('p', { html: st.text }));
      Object.values(boxEls).forEach((g) => g.classList.remove('active'));
      boxEls[st.from].classList.add('active');
      boxEls[st.to].classList.add('active');
      const A = BOX[st.from];
      const B = BOX[st.to];
      const p1 = edgePoint(A, center(B).x, center(B).y);
      const p2 = edgePoint(B, center(A).x, center(A).y);
      tokenT.textContent = st.label;
      token.style.display = '';
      anim = {
        p1,
        p2,
        t: 0,
        dur: 0.9,
        cb: () => {
          if (st.fx) st.fx(S);
          renderState();
          if (stepIdx + 1 >= sc2.steps.length) {
            playing = false;
            renderCtrl();
          }
        },
      };
      waitT = st.text ? 1.3 : 0.5;
    }

    let lastT = performance.now();
    sc.interval(() => {
      const now = performance.now();
      const dt = Math.min(0.25, (now - lastT) / 1000);
      lastT = now;
      if (anim) {
        anim.t += dt * speed;
        const k = Math.min(1, anim.t / anim.dur);
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        const x = anim.p1.x + (anim.p2.x - anim.p1.x) * e;
        const y = anim.p1.y + (anim.p2.y - anim.p1.y) * e;
        token.setAttribute('transform', `translate(${x},${y})`);
        if (k >= 1) {
          const cb = anim.cb;
          anim = null;
          cb();
        }
      } else if (playing) {
        waitT -= dt * speed;
        if (waitT <= 0) nextStep();
      }
    }, 16);

    let ctrlSig = '';
    function renderCtrl() {
      const done = stepIdx + 1 >= SCENARIOS[scIdx].steps.length && !anim;
      const sig = [playing, done, speed].join('|');
      if (sig === ctrlSig) return;
      ctrlSig = sig;
      KG.fill(
        ctrl,
        h(
          'button',
          {
            class: 'btn primary',
            onclick: () => {
              if (done) setScenario(scIdx);
              playing = !playing;
              if (playing && !anim) nextStep();
              renderCtrl();
            },
          },
          playing ? '⏸ 暂停' : done ? '↺ 重播' : '▶ 播放'
        ),
        h(
          'button',
          {
            class: 'btn',
            disabled: done,
            onclick: () => {
              playing = false;
              nextStep();
              renderCtrl();
            },
          },
          '下一步 ⏭'
        ),
        h('span', { class: 'spacer' }),
        h('span', { class: 'muted-text' }, '速度'),
        [0.5, 1, 2].map((k) => h('button', { class: 'btn small' + (speed === k ? ' active' : ''), onclick: () => ((speed = k), (ctrlSig = ''), renderCtrl()) }, k + '×')),
        stepNo
      );
    }

    host.append(
      h(
        'section',
        { class: 'panel intro' },
        h('h2', null, 'Operator 解剖：一个事件的旅程'),
        h('p', { html: 'Operator = <b>CRD</b>（定义一种新资源）+ <b>自定义控制器</b>（把运维知识写成代码）。选一个场景，看事件怎样从 API Server 流经 Informer、WorkQueue，最后变成一次 Reconcile。' }),
        scTabs
      ),
      h('div', { class: 'g4a-layout' }, h('div', { class: 'panel g4a-stage' }, svg, ctrl), h('div', { class: 'g4a-side' }, h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, '📜 旁白'), narr), h('div', { class: 'panel' }, info)))
    );
    setScenario(0);
    select('reconciler');
    return () => sc.dispose();
  }

  // ================================================================ 4b 我是 Reconciler
  const FIN = 'db.example.com/cleanup';
  const CARDS = {
    get: { short: 'r.Get', code: 'r.Get(ctx, req.NamespacedName, &db)', note: '读取 Database（来自 Informer 缓存）' },
    createSts: { short: 'r.Create(sts)', code: 'r.Create(ctx, newStatefulSet(&db))', note: '创建 StatefulSet（已 SetControllerReference）' },
    applySts: { short: 'CreateOrUpdate(sts)', code: 'controllerutil.CreateOrUpdate(ctx, r.Client, sts, …)', note: '不存在就创建；存在就把 replicas / image 对齐到 spec' },
    createSvc: { short: 'r.Create(svc)', code: 'r.Create(ctx, newService(&db))', note: '创建 Service' },
    applySvc: { short: 'CreateOrUpdate(svc)', code: 'controllerutil.CreateOrUpdate(ctx, r.Client, svc, …)', note: 'Service：不存在就创建，存在就对齐' },
    createSecret: { short: 'r.Create(secret)', code: 'r.Create(ctx, newSecret(&db, randPassword()))', note: '创建 Secret（随机密码）' },
    applySecret: { short: 'CreateOrUpdate(secret)', code: 'controllerutil.CreateOrUpdate(ctx, r.Client, secret, …)', note: 'Secret：mutate 函数里 password = randPassword()' },
    ensureSecret: { short: 'ensureSecret', code: 'if 不存在 { r.Create(ctx, newSecret(&db, randPassword())) }', note: '只在缺失时创建，已存在就保留原密码' },
    statusUpdate: { short: 'Status().Update', code: 'r.Status().Update(ctx, &db)', note: '写 status：observedGeneration、readyReplicas、Ready 条件' },
    updateWrong: { short: 'r.Update', code: 'db.Status.Phase = "Ready"; r.Update(ctx, &db)', note: '用普通 Update 写 status' },
    addFinalizer: { short: 'AddFinalizer', code: 'controllerutil.AddFinalizer(&db, fin); r.Update(ctx, &db)', note: `加上 finalizer ${FIN}` },
    removeFinalizer: { short: 'RemoveFinalizer', code: 'controllerutil.RemoveFinalizer(&db, fin); r.Update(ctx, &db)', note: '移除 finalizer，允许对象被真正删除' },
    ensureBucket: { short: 'EnsureBucket', code: 'if err := cloud.EnsureBucket(db); err != nil { return …, err }', note: '确保云存储桶存在（幂等），失败就返回 err' },
    ensureBucketSwallow: { short: 'EnsureBucket', code: 'if err := cloud.EnsureBucket(db); err != nil { log.Error(err, "") }', note: '确保云存储桶存在，失败只打日志、继续往下走', swallow: true },
    deleteBucket: { short: 'DeleteBucket', code: 'cloud.DeleteBucket(db)', note: '删除云存储桶（外部资源）' },
    deleteChildren: { short: 'r.Delete ×3', code: 'r.Delete(sts); r.Delete(svc); r.Delete(secret)', note: '手动删除所有子资源' },
    retOk: { short: 'return', code: 'return ctrl.Result{}, nil', note: '成功，等下一次事件', ret: 'ok' },
    retRequeue: { short: 'return', code: 'return ctrl.Result{RequeueAfter: 30 * time.Second}, nil', note: '30 秒后再来一次', ret: 'requeue' },
  };
  const BASE_CARDS = ['get', 'createSts', 'applySts', 'createSvc', 'applySvc', 'createSecret', 'applySecret', 'ensureSecret', 'statusUpdate', 'updateWrong', 'retOk', 'retRequeue'];

  function newCR(o) {
    return Object.assign({ exists: true, generation: 1, spec: { replicas: 3, version: '15', backup: false }, status: { observedGeneration: 0, phase: '' }, finalizers: [], deleting: false }, o);
  }
  function fullWorld(o) {
    return Object.assign(
      {
        cr: newCR({ generation: 1, status: { observedGeneration: 1, phase: 'Ready' } }),
        sts: { replicas: 3, image: 'postgres:15' },
        svc: {},
        secret: { pw: 1 },
        bucket: false,
        extFail: 0,
      },
      o
    );
  }

  const REC_LEVELS = [
    {
      id: 'r1',
      title: '第一次 Reconcile',
      intro: '用户刚创建了 <code>Database/mydb</code>（replicas: 3，version: 15）。写出这次 Reconcile：把数据库需要的 StatefulSet、Service、Secret 建出来，再把处理结果写回 status。',
      cards: BASE_CARDS,
      world: () => ({ cr: newCR(), sts: null, svc: null, secret: null, bucket: false, extFail: 0 }),
      runs: [{ title: '用户创建了 Database/mydb（generation 1）' }],
      checks: (w, x) => [
        { text: 'StatefulSet、Service、Secret 都创建出来了', ok: !!(w.sts && w.svc && w.secret) },
        { text: 'StatefulSet 与 spec 一致（replicas 3，postgres:15）', ok: !!w.sts && w.sts.replicas === 3 && w.sts.image === 'postgres:15' },
        { text: 'status.observedGeneration = 1（status 真的写进去了）', ok: w.cr.status.observedGeneration === 1 },
        { text: 'Reconcile 最终成功结束', ok: !x.stuck },
      ],
    },
    {
      id: 'r2',
      title: '幂等与漂移',
      intro: '同一段 Reconcile 代码会被<b>反复</b>调用。这一关你的代码要连续经受 4 次触发，每次看到的世界都不一样，而且它只能拿到一个 key，不知道发生了什么。<br>提示：Secret 里的密码一旦生成，应用就靠它连数据库。',
      cards: BASE_CARDS,
      world: () => ({ cr: newCR(), sts: null, svc: null, secret: null, bucket: false, extFail: 0 }),
      runs: [
        { title: '#1 用户创建了 Database/mydb（generation 1，replicas 3）' },
        { title: '#2 StatefulSet 的 readyReplicas 从 0 变成 3（Owns 触发）', before: (w) => w.sts && (w.sts.ready = 3) },
        { title: '#3 用户把 spec.replicas 改成 5（generation 2）', before: (w) => ((w.cr.generation = 2), (w.cr.spec.replicas = 5)) },
        { title: '#4 有人 kubectl delete svc mydb，还把 StatefulSet 手动 scale 到 1', before: (w) => ((w.svc = null), w.sts && (w.sts.replicas = 1)) },
      ],
      checks: (w, x) => [
        { text: '每次触发都成功结束（没有卡在错误重试里）', ok: !x.stuck, note: x.stuckNote },
        { text: '最终 StatefulSet 副本数 = 5（spec 说了算，手动改动被纠正）', ok: !!w.sts && w.sts.replicas === 5 },
        { text: '被删的 Service 重新建出来了', ok: !!w.svc },
        { text: 'Secret 密码创建后一直没变', ok: !!w.secret && x.pwChanges === 0, note: x.pwChanges ? `密码被改了 ${x.pwChanges} 次，应用连不上数据库了` : null },
        { text: 'status.observedGeneration = 2', ok: w.cr.status.observedGeneration === 2 },
      ],
    },
    {
      id: 'r3',
      title: 'Finalizer 先行',
      intro: '这次 <code>spec.backup: true</code>，Operator 要在云上建一个<b>备份存储桶</b>。它在集群之外，K8s 的垃圾回收管不到，将来删除 CR 时得由你负责清理。<br>在创建外部资源之前，需要先做什么？',
      cards: [...BASE_CARDS, 'addFinalizer', 'ensureBucket'],
      world: () => ({ cr: newCR({ spec: { replicas: 3, version: '15', backup: true } }), sts: null, svc: null, secret: null, bucket: false, extFail: 0 }),
      runs: [{ title: '#1 用户创建了 Database/mydb（backup: true）' }, { title: '#2 StatefulSet 状态变化（Owns 触发）', before: (w) => w.sts && (w.sts.ready = 3) }],
      checks: (w, x) => [
        { text: '存储桶、StatefulSet、Service、Secret 都就位，且两次触发都成功', ok: !!(w.bucket && w.sts && w.svc && w.secret) && !x.stuck },
        { text: `CR 上带着 finalizer ${FIN}`, ok: w.cr.finalizers.includes(FIN) },
        { text: '先加 finalizer，再创建存储桶', ok: x.bucketBeforeFinalizer === false, note: x.bucketBeforeFinalizer ? '如果 Operator 恰好在两步之间崩溃，而用户又删除了 CR，存储桶就永远没人管了' : null },
        { text: 'status.observedGeneration = 1，且密码没被改过', ok: w.cr.status.observedGeneration === 1 && x.pwChanges === 0 },
      ],
    },
    {
      id: 'r4',
      title: '删除与清理',
      intro: '用户执行了 <code>kubectl delete database mydb</code>。因为有 finalizer，对象没有立刻消失，只是被设置了 <code>deletionTimestamp</code>（Terminating）。<br>这次 Reconcile 要把删除流程走完。StatefulSet 等子资源都带着 ownerReferences。',
      cards: [...BASE_CARDS, 'addFinalizer', 'removeFinalizer', 'ensureBucket', 'deleteBucket', 'deleteChildren'],
      world: () => fullWorld({ cr: newCR({ generation: 2, spec: { replicas: 3, version: '15', backup: true }, status: { observedGeneration: 2, phase: 'Ready' }, finalizers: [FIN], deleting: true }), bucket: true }),
      runs: [{ title: '#1 deletionTimestamp 被设置（MODIFIED 事件）' }],
      checks: (w, x) => [
        { text: 'Database 真正被删除了（没有卡在 Terminating）', ok: !w.cr.exists, note: w.cr.exists ? 'finalizer 没移除，对象会永远 Terminating' : null },
        { text: '云存储桶被清理了（没有泄漏）', ok: !w.bucket },
        { text: '先清理外部资源，再移除 finalizer', ok: x.order.indexOf('deleteBucket') >= 0 && x.order.indexOf('removeFinalizer') > x.order.indexOf('deleteBucket'), note: '反过来的话，一旦清理失败，对象已经没了，再也不会触发重试' },
        { text: '没有做多余的事（子资源交给 GC；删除中不要再创建/更新子资源）', ok: !x.manualDelete && !x.touchedWhileDeleting, note: x.manualDelete ? 'ownerReferences + 垃圾回收器会级联删除子资源，不需要手动删' : x.touchedWhileDeleting ? '对象正在被删除，还去创建/更新子资源是白忙活' : null, soft: true },
      ],
    },
    {
      id: 'r5',
      title: '出错要返回',
      intro: '用户把 <code>spec.backup</code> 改成了 true（generation 3）。但云厂商 API 今天不太稳定，<b>前两次</b>调用都会返回 503。finalizer 早就加好了。<br>让存储桶最终被建出来。',
      cards: [...BASE_CARDS, 'ensureBucket', 'ensureBucketSwallow'],
      world: () => fullWorld({ cr: newCR({ generation: 3, spec: { replicas: 3, version: '15', backup: true }, status: { observedGeneration: 2, phase: 'Ready' }, finalizers: [FIN] }), extFail: 2 }),
      runs: [{ title: '#1 spec.backup 改为 true（generation 3）' }],
      checks: (w, x) => [
        { text: '存储桶最终建出来了', ok: !!w.bucket, note: !w.bucket ? '错误被吞掉，Reconcile 返回成功，之后再也没有触发' : null },
        { text: 'status.observedGeneration = 3', ok: w.cr.status.observedGeneration === 3 },
        { text: '错误通过 return err 交给队列限速重试（而不是吞掉）', ok: !x.swallowed, note: x.swallowed ? '吞掉错误后，即使靠 RequeueAfter 轮询碰巧成功，监控和重试退避也都失效了' : null },
      ],
    },
  ];

  // ---------- 执行引擎
  function execOnce(w, prog, x) {
    const lines = [];
    let loaded = false;
    const say = (ok, card, msg) => lines.push({ ok, card, msg });
    const needDb = (id) => {
      if (!loaded) {
        say(false, id, 'db 还是空的：要先 r.Get 读取对象');
        return false;
      }
      return true;
    };
    for (const id of prog) {
      const cr = w.cr;
      switch (id) {
        case 'get':
          if (!cr.exists) {
            say(true, id, 'NotFound → client.IgnoreNotFound(err)，对象已不存在，直接结束');
            return { lines, ret: 'ok', ended: true };
          }
          loaded = true;
          say(true, id, `读到 mydb：generation ${cr.generation}，replicas ${cr.spec.replicas}${cr.deleting ? '，⚠ deletionTimestamp 已设置' : ''}`);
          break;
        case 'createSts':
        case 'createSvc':
        case 'createSecret': {
          if (!needDb(id)) return { lines, err: true };
          if (!cr.exists) return say(false, id, 'Database 已经不存在（NotFound）'), { lines, err: true };
          const key = { createSts: 'sts', createSvc: 'svc', createSecret: 'secret' }[id];
          if (w[key]) {
            say(false, id, `AlreadyExists：${key === 'sts' ? 'statefulsets.apps' : key === 'svc' ? 'services' : 'secrets'} "mydb" already exists`);
            return { lines, err: true };
          }
          if (cr.deleting) x.touchedWhileDeleting = true;
          if (key === 'sts') w.sts = { replicas: cr.spec.replicas, image: 'postgres:' + cr.spec.version };
          else if (key === 'svc') w.svc = {};
          else w.secret = { pw: ++x.pwSeq };
          say(true, id, `创建了 ${key === 'sts' ? `StatefulSet（replicas ${cr.spec.replicas}）` : key === 'svc' ? 'Service' : 'Secret（新密码）'}`);
          break;
        }
        case 'applySts':
        case 'applySvc':
        case 'applySecret': {
          if (!needDb(id)) return { lines, err: true };
          if (!cr.exists) return say(false, id, 'owner 已不存在（NotFound）'), { lines, err: true };
          if (cr.deleting) x.touchedWhileDeleting = true;
          if (id === 'applySts') {
            if (!w.sts) {
              w.sts = { replicas: cr.spec.replicas, image: 'postgres:' + cr.spec.version };
              say(true, id, `created：StatefulSet（replicas ${cr.spec.replicas}）`);
            } else if (w.sts.replicas !== cr.spec.replicas || w.sts.image !== 'postgres:' + cr.spec.version) {
              const was = w.sts.replicas;
              w.sts.replicas = cr.spec.replicas;
              w.sts.image = 'postgres:' + cr.spec.version;
              say(true, id, `updated：replicas ${was} → ${cr.spec.replicas}`);
            } else say(true, id, 'unchanged：已经和 spec 一致');
          } else if (id === 'applySvc') {
            say(true, id, w.svc ? 'unchanged' : 'created：Service');
            w.svc = w.svc || {};
          } else {
            if (w.secret) {
              w.secret.pw = ++x.pwSeq;
              x.pwChanges++;
              say(false, id, 'updated：mutate 又生成了一个新密码！应用手里的旧密码失效了', true);
              lines[lines.length - 1].warn = true;
            } else {
              w.secret = { pw: ++x.pwSeq };
              say(true, id, 'created：Secret');
            }
          }
          break;
        }
        case 'ensureSecret':
          if (!needDb(id)) return { lines, err: true };
          if (!cr.exists) return say(false, id, 'owner 已不存在（NotFound）'), { lines, err: true };
          if (w.secret) say(true, id, '已存在，保留原密码');
          else {
            if (cr.deleting) x.touchedWhileDeleting = true;
            w.secret = { pw: ++x.pwSeq };
            say(true, id, '创建了 Secret');
          }
          break;
        case 'statusUpdate':
          if (!needDb(id)) return { lines, err: true };
          if (!cr.exists) return say(false, id, 'NotFound：Database 已经被删除了，这次 Reconcile 报错并重试'), { lines, err: true };
          cr.status = { observedGeneration: cr.generation, phase: w.sts ? 'Ready' : 'Pending' };
          say(true, id, `status.observedGeneration=${cr.generation}，phase=${cr.status.phase}`);
          break;
        case 'updateWrong':
          if (!needDb(id)) return { lines, err: true };
          if (!cr.exists) return say(false, id, 'NotFound'), { lines, err: true };
          x.wrongStatus = true;
          say(true, id, '返回成功……但 CRD 开启了 status 子资源，普通 Update 会忽略 status 字段，什么都没写进去');
          lines[lines.length - 1].warn = true;
          break;
        case 'addFinalizer':
          if (!needDb(id)) return { lines, err: true };
          if (!cr.exists) return say(false, id, 'NotFound'), { lines, err: true };
          if (cr.deleting && !cr.finalizers.includes(FIN)) {
            say(false, id, 'Forbidden：对象正在删除，不能再添加新的 finalizer');
            return { lines, err: true };
          }
          if (cr.finalizers.includes(FIN)) say(true, id, '已经有 finalizer 了，无需 Update');
          else {
            cr.finalizers.push(FIN);
            say(true, id, `加上了 finalizer ${FIN}`);
          }
          x.order.push('addFinalizer');
          break;
        case 'removeFinalizer':
          if (!needDb(id)) return { lines, err: true };
          if (!cr.exists) return say(false, id, 'NotFound'), { lines, err: true };
          cr.finalizers = cr.finalizers.filter((f) => f !== FIN);
          x.order.push('removeFinalizer');
          if (cr.deleting && !cr.finalizers.length) {
            cr.exists = false;
            const gc = [w.sts && 'StatefulSet', w.svc && 'Service', w.secret && 'Secret'].filter(Boolean);
            w.sts = null;
            w.svc = null;
            w.secret = null;
            say(true, id, `finalizer 已移除 → API Server 删除了 Database；垃圾回收器级联删除 ${gc.join(' / ') || '（无子资源）'}`);
          } else say(true, id, '移除了 finalizer');
          break;
        case 'ensureBucket':
        case 'ensureBucketSwallow': {
          if (!needDb(id)) return { lines, err: true };
          if (!cr.spec.backup) {
            say(true, id, 'spec.backup=false，跳过');
            break;
          }
          if (!w.bucket && w.extFail > 0) {
            w.extFail--;
            if (id === 'ensureBucketSwallow') {
              x.swallowed = true;
              say(false, id, '云 API 返回 503……只打了一行日志，假装没事继续往下走');
              lines[lines.length - 1].warn = true;
              break;
            }
            say(false, id, '云 API 返回 503 Service Unavailable → return err');
            return { lines, err: true };
          }
          if (w.bucket) say(true, id, '存储桶已存在');
          else {
            if (!cr.finalizers.includes(FIN)) x.bucketBeforeFinalizer = true;
            else if (x.bucketBeforeFinalizer == null) x.bucketBeforeFinalizer = false;
            w.bucket = true;
            say(true, id, '在云上创建了存储桶 mydb-backup');
          }
          x.order.push('ensureBucket');
          break;
        }
        case 'deleteBucket':
          if (!needDb(id)) return { lines, err: true };
          if (w.bucket) {
            w.bucket = false;
            say(true, id, '删除了云存储桶');
          } else say(true, id, '存储桶本来就不存在');
          x.order.push('deleteBucket');
          break;
        case 'deleteChildren':
          if (!needDb(id)) return { lines, err: true };
          x.manualDelete = true;
          w.sts = null;
          w.svc = null;
          w.secret = null;
          say(true, id, '手动删掉了 StatefulSet / Service / Secret');
          lines[lines.length - 1].warn = true;
          break;
        case 'retOk':
          say(true, id, 'Forget(key)，等待下一次事件');
          return { lines, ret: 'ok' };
        case 'retRequeue':
          say(true, id, '30 秒后再次入队');
          return { lines, ret: 'requeue' };
      }
    }
    return { lines, ret: 'ok' };
  }

  function runReconciler(lv, prog) {
    const w = lv.world();
    const x = { order: [], pwSeq: w.secret ? w.secret.pw : 0, pwChanges: 0, stuck: false, stuckNote: null, bucketBeforeFinalizer: null, retries: 0, requeues: 0 };
    const trace = [];
    for (const run of lv.runs) {
      if (run.before) run.before(w);
      const block = { title: run.title, attempts: [] };
      trace.push(block);
      let attempt = 0;
      let backoff = 5;
      while (true) {
        attempt++;
        const r = execOnce(w, prog, x);
        block.attempts.push(r);
        if (r.err) {
          x.retries++;
          if (attempt >= 5) {
            x.stuck = true;
            x.stuckNote = `"${run.title}" 这一次一直出错，卡在指数退避重试里`;
            block.after = `✗ 连续 ${attempt} 次出错，卡在限速重试里（退避时间还在翻倍…）`;
            break;
          }
          r.after = `↻ 返回 err → AddRateLimited，${backoff}ms 后重试`;
          backoff *= 2;
          continue;
        }
        if (r.ret === 'requeue') {
          x.requeues++;
          if (attempt < 3) {
            r.after = '↻ RequeueAfter 30s → 再来一次';
            continue;
          }
          r.after = '（之后每 30 秒还会再来一次）';
        }
        break;
      }
    }
    return { w, x, trace };
  }

  function worldView(w) {
    const cr = w.cr;
    const item = (ok, title, detail) => h('div', { class: 'wobj' + (ok ? '' : ' gone') }, h('b', { class: 'mono' }, title), h('span', { class: 'mono muted-text' }, detail));
    return h(
      'div',
      { class: 'world' },
      item(
        cr.exists,
        'Database/mydb',
        cr.exists
          ? `gen ${cr.generation} · replicas ${cr.spec.replicas} · backup ${cr.spec.backup} · status.obsGen ${cr.status.observedGeneration}${cr.finalizers.length ? ' · finalizers [cleanup]' : ''}${cr.deleting ? ' · ⚠ Terminating' : ''}`
          : '已删除'
      ),
      item(!!w.sts, 'StatefulSet/mydb', w.sts ? `replicas ${w.sts.replicas} · ${w.sts.image}` : '不存在'),
      item(!!w.svc, 'Service/mydb', w.svc ? 'ClusterIP' : '不存在'),
      item(!!w.secret, 'Secret/mydb-cred', w.secret ? `password #${w.secret.pw}` : '不存在'),
      item(!!w.bucket, '☁ 存储桶 mydb-backup', w.bucket ? '存在' : '不存在')
    );
  }

  function mountReconciler(host) {
    let idx = Math.min(KG.store.get('g4r:last', 0), REC_LEVELS.length - 1);
    function load(i) {
      idx = i;
      KG.store.set('g4r:last', i);
      KG.clear(host);
      playReconciler(host, i, load);
    }
    load(idx);
    return null;
  }

  function playReconciler(host, li, load) {
    const lv = REC_LEVELS[li];
    let prog = [];
    let runs = 0;
    const progEl = h('div', { class: 'g4r-prog' });
    const traceEl = h('div', { class: 'g4r-trace' });
    const afterEl = h('div');

    function renderProg() {
      const rows = prog.map((id, i) =>
        h(
          'div',
          { class: 'g4r-line' + (CARDS[id].ret ? ' ret' : '') },
          h('span', { class: 'ln' }, i + 1),
          h('div', { class: 'lc' }, h('code', null, CARDS[id].code), h('small', null, '// ' + CARDS[id].note)),
          h(
            'div',
            { class: 'lbtns' },
            h('button', { class: 'icon-btn', 'aria-label': '上移', disabled: i === 0, onclick: () => (([prog[i - 1], prog[i]] = [prog[i], prog[i - 1]]), renderProg()) }, '↑'),
            h('button', { class: 'icon-btn', 'aria-label': '下移', disabled: i === prog.length - 1, onclick: () => (([prog[i + 1], prog[i]] = [prog[i], prog[i + 1]]), renderProg()) }, '↓'),
            h('button', { class: 'icon-btn', 'aria-label': '删除', onclick: () => (prog.splice(i, 1), renderProg()) }, '✕')
          )
        )
      );
      KG.fill(
        progEl,
        h('div', { class: 'g4r-sig mono' }, 'func (r *DatabaseReconciler) Reconcile(ctx context.Context, req ctrl.Request) (ctrl.Result, error) {'),
        h('div', { class: 'g4r-body' }, rows.length ? rows : h('div', { class: 'empty' }, '← 从左边点选代码卡片，按执行顺序排好')),
        h('div', { class: 'g4r-sig mono' }, '}')
      );
    }
    function run() {
      if (!prog.length) return KG.toast('先放几张卡片进来', 'bad');
      const retIdx = prog.findIndex((id) => CARDS[id].ret);
      if (retIdx === -1) return KG.toast('Reconcile 必须以 return 结束：加一张 return 卡片', 'bad');
      if (retIdx !== prog.length - 1) return KG.toast('return 之后的代码永远不会执行：把 return 放到最后', 'bad');
      runs++;
      const { w, x, trace } = runReconciler(lv, prog);
      KG.fill(
        traceEl,
        trace.map((b) =>
          h(
            'div',
            { class: 'g4r-run' },
            h('div', { class: 'g4r-run-title' }, '▶ ' + b.title),
            b.attempts.map((a, k) =>
              h(
                'div',
                { class: 'g4r-attempt' },
                b.attempts.length > 1 ? h('div', { class: 'muted-text' }, `第 ${k + 1} 次执行`) : null,
                a.lines.map((l) => h('div', { class: 'g4r-tl ' + (l.warn ? 'warn' : l.ok ? 'ok' : 'bad') }, h('span', null, l.warn ? '⚠' : l.ok ? '✓' : '✗'), h('code', null, CARDS[l.card].short), h('span', null, l.msg))),
                a.after ? h('div', { class: 'g4r-after' }, a.after) : null
              )
            ),
            b.after ? h('div', { class: 'g4r-after bad-text' }, b.after) : null
          )
        )
      );
      KG.fill(afterEl, h('div', { class: 'panel-title' }, '执行后的世界'), worldView(w));
      const checks = lv.checks(w, x);
      if (x.wrongStatus && !checks.some((c) => /observedGeneration/.test(c.text) && c.ok)) {
        checks.push({ text: '（提示）r.Update 写不进 status，要用 r.Status().Update', ok: false, soft: true });
      }
      const hard = checks.filter((c) => !c.soft);
      const pass = hard.every((c) => c.ok);
      const clean = checks.every((c) => c.ok) && !x.wrongStatus && x.pwChanges === 0 && !x.manualDelete && !x.touchedWhileDeleting;
      const stars = pass ? 1 + (clean ? 1 : 0) + (runs === 1 ? 1 : 0) : 0;
      KG.showResult({
        game: GAME,
        level: 'rec-' + lv.id,
        stars,
        goals: [
          ...checks,
          { text: '★★ 代码干净：没有多余或危险的操作', ok: pass && clean },
          { text: '★★★ 第一次运行就通过', ok: pass && runs === 1, note: `这是第 ${runs} 次运行` },
        ],
        summary: pass ? '控制器按预期工作！' : '世界没有到达期望状态，看看执行记录哪里出了问题。',
        onRetry: () => {},
        onNext: pass && li + 1 < REC_LEVELS.length ? () => load(li + 1) : null,
      });
    }

    const palette = h(
      'div',
      { class: 'g4r-palette' },
      lv.cards.map((id) =>
        h(
          'button',
          {
            class: 'g4r-card' + (CARDS[id].ret ? ' ret' : ''),
            onclick: () => {
              prog.push(id);
              renderProg();
            },
          },
          h('code', null, CARDS[id].code),
          h('small', null, CARDS[id].note)
        )
      )
    );
    const initWorld = lv.world();
    host.append(
      KG.levelBar(GAME, REC_LEVELS.map((l) => ({ ...l, id: 'rec-' + l.id })), li, load),
      h(
        'section',
        { class: 'panel intro' },
        h('h2', null, `第 ${li + 1} 关 · ${lv.title}`),
        h('p', { html: lv.intro }),
        h('div', { class: 'g4r-meta' }, h('div', null, h('div', { class: 'panel-title' }, '初始世界'), worldView(initWorld)), h('div', null, h('div', { class: 'panel-title' }, '这段代码会被这样触发'), h('ol', { class: 'g4r-runs' }, lv.runs.map((r) => h('li', null, r.title.replace(/^#\d\s*/, '')))))),
        KG.tip('规则', '• 每张卡片都自带 <code>if err != nil { return ctrl.Result{}, err }</code>（除非卡片自己说明了别的处理方式）。<br>• 出错返回 err 后，队列会指数退避重试，同一次触发最多重试 4 次。<br>• 返回 <code>ctrl.Result{}</code> 后，只有下一次事件才会再触发 Reconcile。<br>• 你写的是<b>同一段代码</b>，它要应付上面列出的每一次触发。')
      ),
      h('div', { class: 'g4r-layout' }, h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, '代码卡片（点击加入）'), palette), h('div', { class: 'panel' }, progEl, h('div', { class: 'row gap', style: { marginTop: '10px' } }, h('button', { class: 'btn primary', onclick: run }, '▶ 运行 Reconcile'), h('button', { class: 'btn ghost', onclick: () => ((prog = []), renderProg()) }, '清空')))),
      h('div', { class: 'g4r-layout' }, h('div', { class: 'panel' }, h('div', { class: 'panel-title' }, '执行记录'), traceEl), h('div', { class: 'panel' }, afterEl))
    );
    KG.fill(traceEl, h('div', { class: 'empty' }, '运行后这里会显示每一次触发的执行过程'));
    renderProg();
  }

  // ================================================================ 4c 概念连连看
  const PAIRS = [
    ['CRD', '向 API Server 注册一种新的资源类型（kind、schema、版本）'],
    ['CR（自定义资源）', '某个 CRD 类型的一个具体实例，比如 Database/mydb'],
    ['Controller', '一个控制循环：监听资源变化，把实际状态推向期望状态'],
    ['Operator', 'CRD + 自定义控制器，把运维某个软件的经验写成代码'],
    ['Reconcile', '控制器的核心函数：拿到一个 key，对比期望与实际并采取行动'],
    ['Informer', 'List & Watch 资源，维护本地缓存，并把变化分发给事件处理器'],
    ['WorkQueue', '存放待处理 key 的队列：自动去重，支持限速重试'],
    ['Level-triggered', '根据当前的完整状态做决定，而不是根据"发生了什么事件"'],
    ['幂等（Idempotent）', '同一个 Reconcile 执行多少次，结果都一样'],
    ['ownerReferences', '声明"我属于谁"；owner 被删除后，由垃圾回收器级联删除'],
    ['Finalizer', '删除前必须完成的清理任务；不移除，对象就一直 Terminating'],
    ['Status 子资源', '只能通过 /status 端点更新，记录控制器观察到的实际状态'],
    ['observedGeneration', '记录 status 对应第几版 spec，用来判断最新变更有没有被处理'],
    ['Condition', 'status 里结构化的状态条目，比如 Ready=True，带 reason 和 message'],
    ['Admission Webhook', '对象写入 etcd 之前，由 API Server 调用来修改或校验请求'],
    ['Leader Election', '多副本部署时用 Lease 锁，保证同一时间只有一个副本在干活'],
    ['RequeueAfter', '让同一个 key 在指定时间之后再进一次 Reconcile'],
    ['Predicate', '事件入队之前的过滤器，比如只关心 generation 的变化'],
    ['Scheme', 'Go 类型和 GroupVersionKind 之间的映射表，序列化对象要靠它'],
    ['Manager', 'controller-runtime 的总管：共享缓存和客户端，启动所有控制器与 Webhook'],
    ['Resync（SyncPeriod）', '定期把缓存里的所有对象重新入队，兜底错过的事件'],
    ['EnqueueRequestForOwner', '子资源变化时，顺着 ownerReference 找到父对象并入队'],
    ['Kubebuilder / Operator SDK', '生成 CRD、控制器脚手架和 RBAC 清单的开发框架'],
    ['Capability Level', 'Operator 成熟度模型：从基础安装到"自动驾驶"共 5 级'],
  ];
  const ROUNDS = [0, 1, 2].map((r) => PAIRS.slice(r * 8, r * 8 + 8));

  function mountMatch(host) {
    const sc = KG.scope();
    let round = Math.min(KG.store.get('g4m:last', 0), ROUNDS.length - 1);
    let st;
    const boardEl = h('div', { class: 'g4m-board' });
    const hudEl = h('div', { class: 'row gap wrap' });
    const barEl = h('div');
    function start(r) {
      round = r;
      KG.store.set('g4m:last', r);
      const pairs = ROUNDS[r];
      const rnd = KG.rng(Date.now() & 0xffff);
      st = { left: KG.shuffle(pairs.map((p, i) => ({ i, text: p[0] })), rnd), right: KG.shuffle(pairs.map((p, i) => ({ i, text: p[1] })), rnd), sel: null, matched: new Set(), mistakes: 0, t0: performance.now(), done: false, flash: null };
      KG.fill(barEl, KG.levelBar(GAME, ROUNDS.map((_, k) => ({ id: 'match-' + (k + 1), title: `第 ${k + 1} 组` })), r, start));
      render();
    }
    function pick(side, item) {
      if (st.done || st.matched.has(item.i)) return;
      if (side === 'L') {
        st.sel = item.i;
        render();
        return;
      }
      if (st.sel == null) {
        KG.toast('先点左边的概念', 'info');
        return;
      }
      if (st.sel === item.i) {
        st.matched.add(item.i);
        st.sel = null;
        render();
        if (st.matched.size === ROUNDS[round].length) finish();
      } else {
        st.mistakes++;
        st.flash = { l: st.sel, r: item.i };
        render();
        sc.timeout(() => {
          st.flash = null;
          render();
        }, 450);
      }
    }
    function finish() {
      st.done = true;
      const secs = (performance.now() - st.t0) / 1000;
      const stars = st.mistakes === 0 ? 3 : st.mistakes <= 2 ? 2 : 1;
      KG.showResult({
        game: GAME,
        level: 'match-' + (round + 1),
        stars,
        goals: [
          { text: '全部配对成功', ok: true, note: `用时 ${secs.toFixed(0)} 秒` },
          { text: '错误 ≤ 2 次', ok: st.mistakes <= 2 },
          { text: '零错误', ok: st.mistakes === 0, note: `错了 ${st.mistakes} 次` },
        ],
        onRetry: () => start(round),
        onNext: round + 1 < ROUNDS.length ? () => start(round + 1) : null,
      });
    }
    function render() {
      KG.fill(hudEl, h('span', { class: 'hud-item' }, '已配对 ', h('b', null, `${st.matched.size}/${ROUNDS[round].length}`)), h('span', { class: 'hud-item' }, '错误 ', h('b', { class: st.mistakes ? 'bad-text' : '' }, st.mistakes)), h('span', { class: 'spacer' }), h('button', { class: 'btn ghost small', onclick: () => start(round) }, '↺ 重新洗牌'));
      const cell = (side, it) => {
        const m = st.matched.has(it.i);
        const sel = side === 'L' && st.sel === it.i;
        const fl = st.flash && ((side === 'L' && st.flash.l === it.i) || (side === 'R' && st.flash.r === it.i));
        return h('button', { class: 'g4m-cell ' + side + (m ? ' matched' : '') + (sel ? ' sel' : '') + (fl ? ' wrong' : ''), disabled: m, onclick: () => pick(side, it) }, it.text);
      };
      KG.fill(boardEl, h('div', { class: 'g4m-col' }, st.left.map((it) => cell('L', it))), h('div', { class: 'g4m-col' }, st.right.map((it) => cell('R', it))));
    }
    host.append(barEl, h('section', { class: 'panel intro' }, h('h2', null, '概念连连看'), h('p', null, '先点左边的概念，再点右边对应的解释。三组共 24 个 Operator / 控制器相关概念。'), KG.goalBox(['全部配对', '错误 ≤ 2 次', '零错误'])), h('div', { class: 'panel' }, hudEl, boardEl));
    start(round);
    return () => sc.dispose();
  }

  // ================================================================ 入口
  const MODES = [
    { id: 'anatomy', icon: '🔬', glyph: 'scope', blurb: '看一个事件怎么流到 Reconcile', title: 'Operator 解剖', mount: mountAnatomy, stars: [], tagline: '6 个场景动画：事件怎么从 API Server 流经 Informer、WorkQueue 到 Reconcile', concepts: ['Informer', 'WorkQueue', 'Reconcile', 'Predicate'], en: { blurb: 'Watch an event flow into Reconcile', title: 'Operator Anatomy', tagline: "Six animated scenes: an event's trip from the API server to Reconcile" } },
    { id: 'reconciler', icon: '🧠', glyph: 'code', blurb: '拼出经得起反复触发的 Reconcile', title: '我是 Reconciler', mount: mountReconciler, stars: REC_LEVELS.map((l) => 'rec-' + l.id), tagline: '用代码卡片拼出 Reconcile 函数，经受多次触发也不出错', concepts: ['幂等', 'level-triggered', 'Finalizer', 'Status 子资源'], en: { blurb: 'Build a Reconcile that survives every retry', title: 'I Am the Reconciler', tagline: 'Build Reconcile from code cards so it holds up when triggered again and again', concepts: ['idempotency', 'level-triggered', 'Finalizer', 'Status subresource'] } },
    { id: 'match', icon: '🃏', glyph: 'cards', blurb: '24 个 Operator 概念配对', title: '概念连连看', mount: mountMatch, stars: ROUNDS.map((_, k) => 'match-' + (k + 1)), tagline: '三组共 24 个 Operator 概念配对', concepts: ['CRD / CR', 'ownerReferences', 'Webhook', 'Leader Election'], en: { blurb: 'Match 24 Operator concepts', title: 'Concept Match', tagline: 'Match 24 Operator concepts in three rounds' } },
  ];

  KG.register({
    id: GAME,
    icon: '🤖',
    glyph: 'bot',
    color: '#a78bfa',
    title: 'Operator 工坊',
    tagline: '拆开 Operator 看事件怎么流动，再亲手写一个 Reconcile',
    modes: MODES,
    concepts: ['CRD / CR', 'Informer', 'WorkQueue', 'Reconcile', 'level-triggered', '幂等', 'ownerReferences', 'Finalizer', 'Status 子资源', 'Webhook', 'Leader Election'],
    en: {
      title: 'Operator Workshop',
      tagline: 'Take an Operator apart to see how events flow, then write a Reconcile yourself',
      concepts: ['CRD / CR', 'Informer', 'WorkQueue', 'Reconcile', 'level-triggered', 'idempotency', 'ownerReferences', 'Finalizer', 'Status subresource', 'Webhook', 'Leader Election'],
    },
    progress: () => {
      const ids = MODES.flatMap((m) => m.stars);
      return { got: ids.reduce((a, id) => a + KG.getStars(GAME, id), 0), total: ids.length * 3 };
    },
    mount(body, sub) {
      const mode = MODES.find((m) => m.id === sub) || MODES[0];
      const host = h('div');
      body.append(KG.modeTabs(GAME, MODES, mode.id), host);
      return mode.mount(host);
    },
  });

  KG._g4 = { REC_LEVELS, runReconciler, CARDS };
})();
