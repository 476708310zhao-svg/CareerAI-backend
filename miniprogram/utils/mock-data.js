// utils/mock-data.js — 全局 Mock / 静态数据集中管理
// API 不可用时各页面从此处取兜底数据，替换真实数据时只需改这一个文件

// ══════════════════════════════════════════════════════════════
// 职位数据
// ══════════════════════════════════════════════════════════════

/** jobs 页 & search 页兜底职位列表（18 条） */
const JOBS = [
  { id: 'mock_1',  title: 'Senior Frontend Engineer',    company: 'Google',            salary: '$140k - $185k', city: 'Mountain View', state: 'CA', type: 'Full-time', logo: '/images/default-company.png', postedAt: '1 day ago',  optFriendly: true  },
  { id: 'mock_2',  title: 'Backend Engineer (Java)',      company: 'Amazon',            salary: '$130k - $165k', city: 'Seattle',       state: 'WA', type: 'Full-time', logo: '/images/default-company.png', postedAt: '2 days ago', optFriendly: true  },
  { id: 'mock_3',  title: 'Data Scientist',               company: 'Meta',              salary: '$155k - $200k', city: 'Menlo Park',    state: 'CA', type: 'Full-time', logo: '/images/default-company.png', postedAt: 'Today',      optFriendly: true  },
  { id: 'mock_4',  title: 'Product Designer',             company: 'Airbnb',            salary: '$110k - $148k', city: 'San Francisco', state: 'CA', type: 'Remote',    logo: '/images/default-company.png', postedAt: '5 days ago', optFriendly: false },
  { id: 'mock_5',  title: 'Machine Learning Engineer',    company: 'Apple',             salary: '$160k - $210k', city: 'Cupertino',     state: 'CA', type: 'Full-time', logo: '/images/default-company.png', postedAt: '3 days ago', optFriendly: true  },
  { id: 'mock_6',  title: 'Software Development Engineer',company: 'Microsoft',         salary: '$135k - $175k', city: 'Redmond',       state: 'WA', type: 'Full-time', logo: '/images/default-company.png', postedAt: '1 day ago',  optFriendly: true  },
  { id: 'mock_7',  title: 'DevOps Engineer',              company: 'Stripe',            salary: '$125k - $160k', city: 'New York',      state: 'NY', type: 'Full-time', logo: '/images/default-company.png', postedAt: '4 days ago', optFriendly: true  },
  { id: 'mock_8',  title: 'iOS Developer',                company: 'Uber',              salary: '$120k - $155k', city: 'San Francisco', state: 'CA', type: 'Full-time', logo: '/images/default-company.png', postedAt: '6 days ago', optFriendly: false },
  { id: 'mock_9',  title: 'Quantitative Analyst',         company: 'Citadel',           salary: '$180k - $250k', city: 'Chicago',       state: 'IL', type: 'Full-time', logo: '/images/default-company.png', postedAt: '2 days ago', optFriendly: true  },
  { id: 'mock_10', title: 'Product Manager',              company: 'Netflix',           salary: '$145k - $190k', city: 'Los Gatos',     state: 'CA', type: 'Full-time', logo: '/images/default-company.png', postedAt: 'Today',      optFriendly: false },
  { id: 'mock_11', title: 'Full Stack Engineer',          company: 'Salesforce',        salary: '$115k - $150k', city: 'San Francisco', state: 'CA', type: 'Hybrid',    logo: '/images/default-company.png', postedAt: '3 days ago', optFriendly: true  },
  { id: 'mock_12', title: 'Data Engineer',                company: 'Spotify',           salary: '$120k - $158k', city: 'New York',      state: 'NY', type: 'Remote',    logo: '/images/default-company.png', postedAt: '1 week ago', optFriendly: true  },
  { id: 'mock_13', title: 'UX Research Intern',           company: 'LinkedIn',          salary: '$40 - $55/hr',  city: 'Sunnyvale',     state: 'CA', type: 'Intern',    logo: '/images/default-company.png', postedAt: '5 days ago', optFriendly: true  },
  { id: 'mock_14', title: 'AI Research Scientist',        company: 'OpenAI',            salary: '$200k - $300k', city: 'San Francisco', state: 'CA', type: 'Full-time', logo: '/images/default-company.png', postedAt: '2 days ago', optFriendly: false },
  { id: 'mock_15', title: 'Cloud Solutions Architect',    company: 'Amazon Web Services',salary: '$150k - $195k', city: 'Seattle',       state: 'WA', type: 'Full-time', logo: '/images/default-company.png', postedAt: 'Today',      optFriendly: true  },
  { id: 'mock_16', title: 'Android Developer',            company: 'TikTok',            salary: '$130k - $165k', city: 'Los Angeles',   state: 'CA', type: 'Full-time', logo: '/images/default-company.png', postedAt: '3 days ago', optFriendly: true  },
  { id: 'mock_17', title: 'Security Engineer',            company: 'CrowdStrike',       salary: '$135k - $170k', city: 'Austin',        state: 'TX', type: 'Remote',    logo: '/images/default-company.png', postedAt: '4 days ago', optFriendly: true  },
  { id: 'mock_18', title: 'Site Reliability Engineer',    company: 'Tesla',             salary: '$128k - $162k', city: 'Fremont',       state: 'CA', type: 'Full-time', logo: '/images/default-company.png', postedAt: '1 day ago',  optFriendly: false }
];

/** 首页推荐职位（4 条精选） */
const RECOMMEND_JOBS = [
  { id: 'm1', title: 'Frontend Developer', company: 'Google',  salary: '$140k-$180k', city: 'Mountain View', state: 'CA', type: 'Full-time', logo: '/images/default-company.png', postedAt: 'Today',   isMatch: true },
  { id: 'm2', title: 'Backend Engineer',   company: 'Amazon',  salary: '$130k-$160k', city: 'Seattle',       state: 'WA', type: 'Full-time', logo: '/images/default-company.png', postedAt: '2d ago'                },
  { id: 'm3', title: 'Data Scientist',     company: 'Meta',    salary: '$150k-$200k', city: 'Menlo Park',    state: 'CA', type: 'Remote',    logo: '/images/default-company.png', postedAt: '3d ago'                },
  { id: 'm4', title: 'Product Designer',   company: 'Airbnb',  salary: '$110k-$150k', city: 'San Francisco', state: 'CA', type: 'Full-time', logo: '/images/default-company.png', postedAt: '5d ago'                }
];

// ══════════════════════════════════════════════════════════════
// 公司数据
// ══════════════════════════════════════════════════════════════

/** search 页兜底公司列表（9 条） */
const COMPANIES = [
  { id: '1', name: '字节跳动', industry: '互联网', size: '10万+',      logo: '/images/bytedance.png',        jobCount: 156 },
  { id: '2', name: '腾讯',    industry: '互联网', size: '10万+',      logo: '/images/Tencent.png',          jobCount: 203 },
  { id: '3', name: '阿里巴巴', industry: '互联网', size: '10万+',      logo: '/images/Alibaba.png',          jobCount: 178 },
  { id: '4', name: 'Google',  industry: 'Tech',  size: '180,000+',   logo: '/images/default-company.png', jobCount: 320 },
  { id: '5', name: 'Meta',    industry: 'Tech',  size: '80,000+',    logo: '/images/default-company.png', jobCount: 145 },
  { id: '6', name: 'Amazon',  industry: 'Tech',  size: '1,500,000+', logo: '/images/default-company.png', jobCount: 480 },
  { id: '7', name: 'Apple',   industry: 'Tech',  size: '164,000+',   logo: '/images/default-company.png', jobCount: 260 },
  { id: '8', name: '美团',    industry: '互联网', size: '8万+',       logo: '/images/default-company.png', jobCount: 132 },
  { id: '9', name: '京东',    industry: '电商',   size: '5万+',       logo: '/images/default-company.png', jobCount: 98  }
];

// ══════════════════════════════════════════════════════════════
// 面经数据
// ══════════════════════════════════════════════════════════════

/** search 页兜底面经列表（6 条） */
const EXPERIENCES = [
  { id: 1, title: '字节跳动产品经理一面经验分享',    company: '字节跳动', type: '面试', likesCount: 234 },
  { id: 2, title: 'Google SWE 技术面试全流程',      company: 'Google',  type: '面试', likesCount: 456 },
  { id: 3, title: '腾讯前端开发笔试真题',            company: '腾讯',    type: '笔试', likesCount: 189 },
  { id: 4, title: 'Meta 数据科学家面经',            company: 'Meta',    type: '面试', likesCount: 312 },
  { id: 5, title: '阿里巴巴算法工程师面试经验',       company: '阿里巴巴', type: '面试', likesCount: 267 },
  { id: 6, title: 'Amazon SDE 系统设计面试总结',    company: 'Amazon',  type: '面试', likesCount: 198 }
];

// ══════════════════════════════════════════════════════════════
// 薪资数据
// ══════════════════════════════════════════════════════════════

/** salary 页预设岗位 */
const SALARY_ROLES = [
  { name: 'Software Engineer', emoji: '💻', naRange: '$110k–$220k', cnRange: '20k–60k' },
  { name: 'Product Manager',   emoji: '🎯', naRange: '$100k–$180k', cnRange: '18k–50k' },
  { name: 'Data Scientist',    emoji: '📊', naRange: '$110k–$200k', cnRange: '20k–55k' },
  { name: 'UX Designer',       emoji: '🎨', naRange: '$80k–$150k',  cnRange: '12k–35k' },
  { name: 'DevOps Engineer',   emoji: '⚙️', naRange: '$100k–$180k', cnRange: '18k–45k' },
  { name: 'ML Engineer',       emoji: '🤖', naRange: '$130k–$230k', cnRange: '25k–70k' }
];

/** salary 页热门公司快捷搜索 */
const SALARY_COMPANIES = ['Google', 'Amazon', 'Meta', 'Microsoft', 'Apple', '字节跳动', '腾讯', '阿里巴巴'];

/**
 * 公司横向对比薪资基准（中位数，单位：原始数值，NA=USD/yr，CN=CNY/yr）
 * key = `${company}__${position}__${region}`
 */
const COMPANY_SALARY_BASE = {
  // ── 北美 Software Engineer ────────────────────────────────
  'Google__Software Engineer__NA':    { min: 160000, median: 195000, max: 240000 },
  'Meta__Software Engineer__NA':      { min: 165000, median: 200000, max: 250000 },
  'Apple__Software Engineer__NA':     { min: 155000, median: 185000, max: 225000 },
  'Amazon__Software Engineer__NA':    { min: 145000, median: 172000, max: 215000 },
  'Microsoft__Software Engineer__NA': { min: 140000, median: 168000, max: 210000 },
  'Netflix__Software Engineer__NA':   { min: 180000, median: 220000, max: 280000 },
  'Stripe__Software Engineer__NA':    { min: 155000, median: 185000, max: 230000 },
  'Uber__Software Engineer__NA':      { min: 148000, median: 175000, max: 218000 },
  // ── 北美 Data Scientist ───────────────────────────────────
  'Google__Data Scientist__NA':       { min: 150000, median: 185000, max: 228000 },
  'Meta__Data Scientist__NA':         { min: 155000, median: 192000, max: 238000 },
  'Amazon__Data Scientist__NA':       { min: 135000, median: 162000, max: 200000 },
  'Microsoft__Data Scientist__NA':    { min: 132000, median: 158000, max: 195000 },
  // ── 北美 Product Manager ─────────────────────────────────
  'Google__Product Manager__NA':      { min: 145000, median: 180000, max: 225000 },
  'Meta__Product Manager__NA':        { min: 150000, median: 185000, max: 230000 },
  'Amazon__Product Manager__NA':      { min: 135000, median: 165000, max: 205000 },
  'Microsoft__Product Manager__NA':   { min: 130000, median: 158000, max: 198000 },
  // ── 国内 软件工程师 ───────────────────────────────────────
  '字节跳动__软件工程师__CN':         { min: 300000, median: 500000, max: 700000 },
  '腾讯__软件工程师__CN':             { min: 280000, median: 460000, max: 650000 },
  '阿里巴巴__软件工程师__CN':         { min: 260000, median: 430000, max: 600000 },
  '美团__软件工程师__CN':             { min: 240000, median: 390000, max: 550000 },
  '京东__软件工程师__CN':             { min: 200000, median: 340000, max: 480000 },
  '华为__软件工程师__CN':             { min: 280000, median: 450000, max: 620000 },
  '快手__软件工程师__CN':             { min: 260000, median: 420000, max: 580000 },
  // ── 国内 产品经理 ─────────────────────────────────────────
  '字节跳动__产品经理__CN':           { min: 240000, median: 400000, max: 580000 },
  '腾讯__产品经理__CN':               { min: 220000, median: 360000, max: 520000 },
  '阿里巴巴__产品经理__CN':           { min: 200000, median: 340000, max: 490000 },
  '美团__产品经理__CN':               { min: 180000, median: 300000, max: 430000 },
};

/** salary 页国内岗位 mock 薪资范围（年薪，单位元） */
const SALARY_CN_MAP = {
  '软件工程师': { min: 240000, max: 600000, median: 400000 },
  '前端工程师': { min: 200000, max: 500000, median: 330000 },
  '产品经理':   { min: 180000, max: 480000, median: 300000 },
  '数据分析师': { min: 150000, max: 400000, median: 250000 },
  'default':   { min: 200000, max: 500000, median: 320000 }
};

// ══════════════════════════════════════════════════════════════
// 投递记录
// ══════════════════════════════════════════════════════════════

/** applications 页 API 失败兜底数据（4 条） */
const APPLICATIONS = [
  { id: 1, job_title: '高级前端工程师', company: '腾讯',    city: '深圳', salary: '25k-45k', status: 'offer',     applied_at: '2024-10-15' },
  { id: 2, job_title: '产品经理',       company: '字节跳动', city: '北京', salary: '30k-50k', status: 'interview', applied_at: '2024-10-20' },
  { id: 3, job_title: '数据分析师',     company: '阿里巴巴', city: '杭州', salary: '20k-35k', status: 'pending',   applied_at: '2024-10-22' },
  { id: 4, job_title: '用户体验设计师', company: '美团',     city: '上海', salary: '18k-30k', status: 'rejected',  applied_at: '2024-10-01' }
];

// ══════════════════════════════════════════════════════════════
// 新闻快讯
// ══════════════════════════════════════════════════════════════

/** 首页动态快讯静态内容（16 条，含 news / tip / data / policy 四种类型） */
const NEWS_FEED = [
  { id: 'n1',  type: 'news',   title: '2026春招：字节跳动开放200+海外留学生岗位',    desc: '涵盖技术、产品、运营等方向，投递截止日期为4月15日' },
  { id: 'n2',  type: 'news',   title: 'Google 2026 New Grad 岗位已开放申请',        desc: 'SWE/PM/DS等多个方向，支持H1B sponsorship' },
  { id: 'n3',  type: 'news',   title: '腾讯海外招聘专场：覆盖北美/欧洲/新加坡',      desc: '技术类岗位竞争激烈，提前投递更有优势' },
  { id: 'n4',  type: 'news',   title: 'Amazon 2026暑期实习申请截止倒计时',          desc: 'SDE实习竞争激烈，建议尽早投递并准备Leadership Principles' },
  { id: 'n5',  type: 'news',   title: '华为海外留学生招聘「天才少年」计划',           desc: '顶尖薪资，面向AI/芯片/系统方向博士及硕士' },
  { id: 'n6',  type: 'tip',    title: '面试技巧：如何用STAR法则回答行为面试题',       desc: '行为面试是留学生最容易失分的环节，掌握STAR法则是关键' },
  { id: 'n7',  type: 'tip',    title: '简历优化：量化你的项目成果',                  desc: '用数据说话，让简历脱颖而出' },
  { id: 'n8',  type: 'tip',    title: 'System Design面试：从0到1设计思路',          desc: '掌握需求分析→高层设计→详细设计→瓶颈优化四步法' },
  { id: 'n9',  type: 'tip',    title: '网申技巧：如何让简历通过ATS筛选',             desc: '90%的简历被ATS系统淘汰，学会优化才能过关' },
  { id: 'n10', type: 'tip',    title: '英文面试：常用表达句式和加分技巧',             desc: '非母语面试者掌握这些句式能显著提升表现' },
  { id: 'n11', type: 'data',   title: '薪资报告：CS硕士美国平均起薪达$125k',         desc: '计算机相关专业留学生薪资持续上涨' },
  { id: 'n12', type: 'data',   title: '数据分析师岗位需求同比增长35%',              desc: 'Python+SQL+Tableau成为数据岗标配技能组合' },
  { id: 'n13', type: 'data',   title: '2026留学生就业报告：回国比例创新高',          desc: '超60%的留学生选择回国发展，一线城市最受青睐' },
  { id: 'n14', type: 'policy', title: 'OPT/CPT政策更新：STEM延期最新指南',          desc: '了解最新的STEM OPT延期政策和申请注意事项' },
  { id: 'n15', type: 'policy', title: 'H1B签证抽签改革：一人一签新规详解',           desc: '新规堵住多次注册漏洞，对留学生影响几何？' },
  { id: 'n16', type: 'policy', title: '国内落户政策：留学生一线城市落户指南',         desc: '北上广深杭落户条件汇总，把握窗口期' }
];

// ══════════════════════════════════════════════════════════════
// 精选题库（100 题）
// ══════════════════════════════════════════════════════════════

/** experiences 页本地精选面试题（100 题，8 个分类） */
const QUESTIONS = [
  // ── Java ──────────────────────────────────────────────────
  { id: 1,  title: 'HashMap 的底层实现原理是什么？',           category: 'java',     difficulty: '中等', views: 1205, answer: 'JDK1.7 使用数组+链表，JDK1.8 引入红黑树。当链表长度>=8且数组长度>=64时，链表转红黑树。负载因子0.75，初始容量16，扩容为2倍。' },
  { id: 2,  title: 'JVM 垃圾回收机制有哪些？',                category: 'java',     difficulty: '困难', views: 980,  answer: '标记-清除、标记-整理、复制算法、分代收集。新生代用复制算法（Eden:S0:S1=8:1:1），老年代用标记-整理。常见收集器：Serial、ParNew、CMS、G1、ZGC。' },
  { id: 3,  title: 'synchronized 和 ReentrantLock 的区别？', category: 'java',     difficulty: '中等', views: 856,  answer: 'synchronized是JVM层面锁，ReentrantLock是API层面锁。后者支持公平锁、可中断、超时获取、多条件变量Condition。' },
  { id: 4,  title: 'Spring Boot 自动装配原理？',              category: 'java',     difficulty: '困难', views: 1320, answer: '@EnableAutoConfiguration通过SpringFactoriesLoader加载spring.factories中的自动配置类，配合@Conditional条件注解实现按需装配。' },
  { id: 29, title: 'Java 中 volatile 关键字的作用？',         category: 'java',     difficulty: '中等', views: 1100, answer: '保证可见性（写操作立即刷新到主内存，读操作从主内存读取）和有序性（禁止指令重排序）。不保证原子性，适合状态标记场景。' },
  { id: 30, title: 'Java 线程池有哪些核心参数？',              category: 'java',     difficulty: '中等', views: 1250, answer: 'corePoolSize核心线程数、maximumPoolSize最大线程数、keepAliveTime空闲时间、workQueue工作队列、threadFactory线程工厂、handler拒绝策略（AbortPolicy/CallerRunsPolicy/DiscardPolicy/DiscardOldestPolicy）。' },
  { id: 31, title: 'ArrayList 和 LinkedList 的区别？',       category: 'java',     difficulty: '简单', views: 900,  answer: 'ArrayList底层数组，随机访问O(1)，插入删除O(n)；LinkedList底层双向链表，插入删除O(1)，随机访问O(n)。内存：ArrayList连续，LinkedList每个节点有额外指针开销。' },
  { id: 32, title: 'Spring AOP 的原理是什么？',               category: 'java',     difficulty: '困难', views: 1050, answer: '面向切面编程，基于动态代理。JDK动态代理（接口），CGLIB代理（无接口/类）。核心概念：切点Pointcut、通知Advice、切面Aspect、连接点JoinPoint。' },
  { id: 33, title: 'Java 中的异常体系如何理解？',              category: 'java',     difficulty: '简单', views: 780,  answer: 'Throwable分Error和Exception。Exception分Checked（编译期必须处理）和Unchecked（RuntimeException）。常见：NullPointerException、ArrayIndexOutOfBoundsException、ClassCastException。' },
  { id: 34, title: '什么是 Java 内存模型（JMM）？',            category: 'java',     difficulty: '困难', views: 920,  answer: 'JMM定义线程如何与内存交互。主内存是共享数据区，工作内存是线程私有副本。happens-before原则：程序顺序、监视器锁、volatile写读、线程启动、线程终结。' },
  { id: 35, title: 'MyBatis 的 #{} 和 ${} 有什么区别？',     category: 'java',     difficulty: '简单', views: 860,  answer: '#{}是预编译占位符，防SQL注入；${}是字符串替换，有注入风险。动态表名、列名用${}，参数值用#{}。' },
  { id: 36, title: 'Spring 事务传播行为有哪些？',              category: 'java',     difficulty: '困难', views: 1080, answer: 'REQUIRED（默认，加入现有/新建）、REQUIRES_NEW（新建，挂起当前）、NESTED（嵌套）、SUPPORTS（有则加入无则非事务）、NOT_SUPPORTED（非事务执行）、MANDATORY（必须有）、NEVER（必须没有）。' },
  { id: 37, title: 'Java 中 final、finally、finalize 的区别？', category: 'java',  difficulty: '简单', views: 740,  answer: 'final修饰类（不可继承）/方法（不可重写）/变量（不可改变）；finally是try-catch中必定执行块；finalize是GC回收对象前调用的方法（已废弃）。' },
  { id: 38, title: 'ConcurrentHashMap 的实现原理？',          category: 'java',     difficulty: '困难', views: 1320, answer: 'JDK1.7分段锁Segment；JDK1.8改用CAS+synchronized，数组+链表+红黑树结构。锁粒度更细，只锁单个桶头节点。size()通过多个CounterCell累加。' },
  // ── 前端 ──────────────────────────────────────────────────
  { id: 5,  title: 'React 和 Vue 的区别有哪些？',             category: 'frontend', difficulty: '简单', views: 3420, answer: 'React推崇函数式+JSX，Vue是渐进式+模板语法。React单向数据流，Vue双向绑定+响应式。生态：React更灵活，Vue更开箱即用。' },
  { id: 6,  title: '从浏览器输入URL到页面显示发生了什么？',     category: 'frontend', difficulty: '困难', views: 5000, answer: 'DNS解析→TCP三次握手→TLS握手→HTTP请求→服务器响应→解析HTML构建DOM→解析CSS构建CSSOM→合并渲染树→布局→绘制→合成' },
  { id: 7,  title: 'JavaScript 事件循环机制？',               category: 'frontend', difficulty: '中等', views: 2890, answer: 'JS单线程，执行栈清空后先执行所有微任务（Promise.then），再取一个宏任务（setTimeout）执行。每次宏任务结束后清空微任务队列。' },
  { id: 8,  title: 'CSS Flex 和 Grid 的区别？',               category: 'frontend', difficulty: '简单', views: 1560, answer: 'Flex一维布局（行或列），Grid二维布局（行+列）。Flex适合组件内部，Grid适合页面整体。两者可嵌套使用。' },
  { id: 9,  title: 'Vue3 Composition API 和 Options API 区别？', category: 'frontend', difficulty: '中等', views: 1780, answer: 'Composition API用setup()组织逻辑，通过ref/reactive创建响应式数据。优势：逻辑复用、更好的TS支持、代码按功能组织。' },
  { id: 39, title: 'HTTP 和 HTTPS 的区别？',                  category: 'frontend', difficulty: '简单', views: 2100, answer: 'HTTPS = HTTP + TLS/SSL加密。区别：HTTPS加密传输（防中间人攻击）、需要证书、端口443、有握手开销。HTTP明文传输，端口80。' },
  { id: 40, title: 'JS 中闭包的概念和应用？',                  category: 'frontend', difficulty: '中等', views: 3200, answer: '函数能访问其定义时词法作用域的变量，即使外部函数已返回。应用：模块化封装、防抖节流、柯里化、计数器。注意内存泄漏。' },
  { id: 41, title: 'Promise 和 async/await 如何工作？',       category: 'frontend', difficulty: '中等', views: 2800, answer: 'Promise是异步操作的封装，链式.then()/.catch()。async/await是Promise的语法糖，let result = await promise，用try/catch捕获错误。async函数返回Promise。' },
  { id: 42, title: 'webpack 打包优化有哪些手段？',             category: 'frontend', difficulty: '困难', views: 1900, answer: '代码分割(splitChunks)、Tree Shaking、懒加载、压缩(terser/css-minimizer)、缓存(contenthash)、DLL、多进程(thread-loader)、减少resolve范围。' },
  { id: 43, title: '什么是跨域？如何解决？',                   category: 'frontend', difficulty: '中等', views: 2400, answer: '协议/域名/端口不同即跨域，浏览器同源策略阻止。解决：CORS（服务端设置Access-Control-Allow-Origin）、Proxy代理、JSONP（仅GET）、PostMessage、Nginx反代。' },
  { id: 44, title: 'CSS 的 BFC 是什么？有什么用？',            category: 'frontend', difficulty: '中等', views: 1600, answer: '块格式化上下文，独立布局区域。触发：overflow非visible、float、position absolute/fixed、display inline-block/flex/grid。用途：清除浮动、防margin折叠、隔离布局。' },
  { id: 45, title: 'React Hooks 的使用原则是什么？',           category: 'frontend', difficulty: '中等', views: 2100, answer: '只在函数顶层调用（不在循环/条件/嵌套函数）；只在React函数组件/自定义Hook中调用。原因：Hooks依赖调用顺序，违反规则会导致状态错乱。' },
  { id: 46, title: 'Vue 的响应式原理是什么？',                 category: 'frontend', difficulty: '困难', views: 2300, answer: 'Vue2用Object.defineProperty劫持getter/setter，Vue3用Proxy。依赖收集：getter触发时将当前Watcher/effect加入依赖；setter触发时通知所有依赖更新。' },
  { id: 47, title: '前端性能优化有哪些方向？',                  category: 'frontend', difficulty: '困难', views: 3500, answer: '加载优化：懒加载/预加载/CDN/压缩/缓存。渲染优化：减少重排重绘/虚拟列表/CSS动画。代码优化：防抖节流/Web Worker。指标：LCP/FID/CLS。' },
  { id: 48, title: 'TypeScript 相比 JS 的优势？',             category: 'frontend', difficulty: '简单', views: 1800, answer: '静态类型检查（减少运行时错误）、更好的IDE提示、接口和泛型支持、可读性更强。缺点：学习曲线、需要编译步骤、对小项目可能过于复杂。' },
  // ── 算法 ──────────────────────────────────────────────────
  { id: 10, title: '快速排序的时间复杂度和实现思路？',           category: 'algorithm', difficulty: '中等', views: 560,  answer: '选择pivot分区，递归排序。平均O(nlogn)，最坏O(n²)。优化：随机选pivot、三数取中、小数组用插入排序。' },
  { id: 11, title: 'LRU 缓存淘汰策略如何实现？',               category: 'algorithm', difficulty: '中等', views: 1450, answer: 'HashMap + 双向链表。HashMap存key到节点映射O(1)查找，双向链表维护访问顺序，最近访问放头部，容量满删尾部。' },
  { id: 12, title: '二叉树的前中后序遍历？',                   category: 'algorithm', difficulty: '简单', views: 2100, answer: '递归：前序（根左右）、中序（左根右）、后序（左右根）。迭代用栈实现。时间O(n)，空间O(h)。' },
  { id: 13, title: '动态规划解题思路和经典问题？',              category: 'algorithm', difficulty: '困难', views: 3200, answer: '核心：最优子结构+重叠子问题。步骤：定义状态→转移方程→初始条件→遍历顺序。经典：背包、LCS、LIS、编辑距离。' },
  { id: 14, title: '图的BFS和DFS应用场景？',                  category: 'algorithm', difficulty: '中等', views: 890,  answer: 'BFS：最短路径(无权图)、层序遍历、拓扑排序。DFS：连通分量、环检测、回溯搜索。时间O(V+E)。' },
  { id: 49, title: '什么是回溯算法？常见应用场景？',            category: 'algorithm', difficulty: '困难', views: 2800, answer: '在搜索过程中遇到不满足条件时"撤销"，尝试其他路径。应用：N皇后、全排列、组合总和、数独、单词搜索。模板：for遍历选择→递归→撤销。' },
  { id: 50, title: '堆排序的原理和复杂度？',                   category: 'algorithm', difficulty: '中等', views: 750,  answer: '建大根堆O(n)→堆顶与末尾交换→heapify→重复。时间O(nlogn)，空间O(1)，不稳定。适合Top-K问题（小根堆维护K个最大值）。' },
  { id: 51, title: '滑动窗口算法思路？',                       category: 'algorithm', difficulty: '中等', views: 1650, answer: '双指针维护窗口[left,right]，right扩展满足条件，left收缩找最优。适合：最长无重复子串、最小覆盖子串、固定窗口最大和。时间O(n)。' },
  { id: 52, title: '什么是贪心算法？如何判断适用性？',          category: 'algorithm', difficulty: '中等', views: 1200, answer: '每步选局部最优，期望达全局最优。适用：有贪心选择性质+最优子结构。经典：区间调度、找零钱（面额有限制）、Dijkstra。不适用背包等问题。' },
  { id: 53, title: '二分查找及其变体？',                       category: 'algorithm', difficulty: '简单', views: 2200, answer: '标准：while(l<=r)，mid=(l+r)/2。变体：查左边界（r=mid-1）/右边界（l=mid+1）。应用：在旋转数组中搜索、找峰值。时间O(logn)。' },
  { id: 54, title: '并查集的原理和应用？',                     category: 'algorithm', difficulty: '中等', views: 980,  answer: '维护集合的数据结构，支持union合并和find查根。路径压缩+按秩合并后近似O(1)。应用：连通性检测、最小生成树Kruskal、社交网络好友关系。' },
  { id: 55, title: '字典树 Trie 的原理？',                    category: 'algorithm', difficulty: '中等', views: 860,  answer: '多叉树，每个节点代表字符串前缀。插入/查找O(m)，m为字符串长度。应用：自动补全、IP路由、单词搜索。空间换时间。' },
  { id: 56, title: '分治法的思想和经典问题？',                 category: 'algorithm', difficulty: '中等', views: 1100, answer: '将问题分解为子问题递归求解再合并。经典：归并排序、快速排序、大整数乘法（Karatsuba）、矩阵乘法（Strassen）。关键分析Master定理。' },
  { id: 87, title: '什么是拓扑排序？如何实现？',               category: 'algorithm', difficulty: '中等', views: 1050, answer: '有向无环图（DAG）的线性排序。Kahn算法：BFS，维护入度为0的队列；DFS逆后序。时间O(V+E)。应用：任务调度、编译依赖。' },
  { id: 88, title: 'Dijkstra 和 Bellman-Ford 算法比较？',    category: 'algorithm', difficulty: '困难', views: 890,  answer: 'Dijkstra：贪心，优先队列，O((V+E)logV)，不支持负权边；Bellman-Ford：动态规划，O(VE)，支持负权边，可检测负权环。' },
  { id: 89, title: '如何解决数组中的 Two Sum 类问题？',        category: 'algorithm', difficulty: '简单', views: 3100, answer: 'HashMap存遍历过的元素，每步查 target-nums[i] 是否在map中，O(n)。变体：Three Sum用排序+双指针O(n²)。注意去重。' },
  { id: 90, title: '什么是单调栈？常见应用场景？',             category: 'algorithm', difficulty: '中等', views: 1400, answer: '栈内元素单调递增或递减。应用：下一个更大元素、柱状图最大矩形、接雨水、每日温度。核心：遍历时弹出不满足单调性的元素并处理。' },
  { id: 91, title: '字符串匹配 KMP 算法原理？',               category: 'algorithm', difficulty: '困难', views: 980,  answer: '预处理模式串得到next数组（最长公共前后缀长度）。匹配失败时不从头重来，利用next回跳。时间O(n+m)，优于暴力O(nm)。' },
  // ── 系统设计 ──────────────────────────────────────────────
  { id: 15, title: 'TCP 和 UDP 的区别？',                    category: 'system',    difficulty: '中等', views: 890,  answer: 'TCP面向连接、可靠传输、流量控制、拥塞控制。UDP无连接、不可靠、开销小、速度快。TCP适合HTTP，UDP适合直播/游戏。' },
  { id: 16, title: '如何设计一个短链接系统？',                 category: 'system',    difficulty: '困难', views: 2340, answer: '长URL→短码映射。自增ID转62进制或MD5取前6位。MySQL/Redis存储，缓存+302重定向。考虑过期策略、限流、统计。' },
  { id: 17, title: 'Redis 常用数据类型和应用场景？',           category: 'system',    difficulty: '中等', views: 1890, answer: 'String:缓存/计数器 Hash:对象存储 List:消息队列 Set:标签/抽奖 ZSet:排行榜 Bitmap:签到 Stream:消费组' },
  { id: 18, title: '微服务架构的优缺点？',                    category: 'system',    difficulty: '困难', views: 1560, answer: '优点：独立部署、技术栈灵活、按需扩展。缺点：分布式复杂性、数据一致性、运维成本。核心组件：注册发现、网关、熔断降级。' },
  { id: 57, title: '如何设计一个消息队列系统？',               category: 'system',    difficulty: '困难', views: 2100, answer: '核心：Producer/Broker/Consumer。Broker：持久化（WAL/分区）、副本复制、Leader选举。Consumer：拉模式、offset管理、消费组负载均衡。' },
  { id: 58, title: '数据库分库分表策略？',                    category: 'system',    difficulty: '困难', views: 1800, answer: '垂直分库（按业务）/垂直分表（按字段冷热）/水平分库分表（按ID范围/hash取模/一致性哈希）。问题：跨库查询、分布式事务、全局唯一ID（雪花算法）。' },
  { id: 59, title: '如何保证接口的幂等性？',                  category: 'system',    difficulty: '中等', views: 1350, answer: '唯一请求ID（Token+Redis存储）、数据库唯一约束、乐观锁（version字段）、状态机（只允许特定状态流转）。支付场景必须实现幂等。' },
  { id: 60, title: 'CDN 的工作原理？',                       category: 'system',    difficulty: '中等', views: 1250, answer: '就近分发：DNS解析到最近节点→节点有缓存直接返回→无缓存回源拉取并缓存。适合静态资源/视频。缓存策略：max-age/ETag/版本号。' },
  { id: 61, title: '分布式锁的实现方案？',                    category: 'system',    difficulty: '困难', views: 2200, answer: 'Redis：SET key value NX EX（Redlock多节点）；ZooKeeper：临时有序节点，最小编号获锁；数据库：唯一索引INSERT。注意：超时自动释放、防误删（UUID标识）、可重入。' },
  { id: 62, title: '如何设计一个秒杀系统？',                  category: 'system',    difficulty: '困难', views: 2800, answer: '前端：限时按钮/验证码；网关：限流（令牌桶）/鉴权；库存：Redis预减（lua脚本保原子）；队列：异步下单（MQ削峰）；数据库：乐观锁最终更新。' },
  { id: 63, title: 'CAP 理论和 BASE 理论？',                 category: 'system',    difficulty: '困难', views: 1650, answer: 'CAP：一致性C/可用性A/分区容错P三者取其二。分布式系统P必选，多选CA vs CP。BASE：基本可用/软状态/最终一致性，是对ACID的折衷。' },
  { id: 64, title: 'HTTP 缓存机制有哪些？',                  category: 'system',    difficulty: '中等', views: 1500, answer: '强缓存：Cache-Control(max-age)/Expires，直接用本地缓存。协商缓存：Last-Modified/If-Modified-Since、ETag/If-None-Match，304返回。优先强缓存。' },
  { id: 92, title: '如何设计一个通知推送系统？',               category: 'system',    difficulty: '困难', views: 1700, answer: '离线推送：APNs/FCM+设备token。在线推送：WebSocket/长轮询/SSE。消息中台：Kafka解耦，优先级队列，幂等去重（messageId），已读未读状态，多端同步。' },
  { id: 93, title: '负载均衡的常见算法？',                    category: 'system',    difficulty: '中等', views: 1350, answer: '轮询/加权轮询、随机/加权随机、IP Hash（会话保持）、最少连接数、响应时间加权。七层（Nginx，按URL）vs 四层（LVS/HAProxy，按IP+端口）。' },
  { id: 94, title: '什么是服务熔断和服务降级？',               category: 'system',    difficulty: '中等', views: 1600, answer: '熔断：下游服务故障时自动断开（Closed→Open→Half-Open），防级联故障，Hystrix/Resilience4j实现。降级：系统压力大时主动关闭非核心服务，保证主流程可用。' },
  { id: 95, title: '如何实现全文搜索功能？',                  category: 'system',    difficulty: '困难', views: 1450, answer: 'Elasticsearch：倒排索引（词→文档ID列表），分词器（IK分词），BM25相关性评分，分片+副本。同步：Logstash/Canal读binlog同步MySQL数据到ES。' },
  { id: 96, title: 'OAuth 2.0 和 JWT 的工作原理？',         category: 'system',    difficulty: '中等', views: 1800, answer: 'OAuth2.0：授权框架，4种流程（授权码最安全）。JWT：Header.Payload.Signature，无状态，服务端不存储，但无法主动废除（需结合Redis黑名单）。' },
  // ── 行为面试 ──────────────────────────────────────────────
  { id: 19, title: '介绍一个你最满意的项目经历？',             category: 'behavior',  difficulty: '中等', views: 2200, answer: 'STAR法则：Situation+Task+Action+Result。重点突出个人贡献、技术深度、量化成果。' },
  { id: 20, title: '你最大的优点和缺点是什么？',               category: 'behavior',  difficulty: '简单', views: 1800, answer: '优点选与岗位相关的配案例。缺点选真实但不致命的，重点说改进措施。真诚为主。' },
  { id: 21, title: '遇到团队冲突你会怎么解决？',               category: 'behavior',  difficulty: '中等', views: 1350, answer: '倾听→数据说话→寻找共同目标→必要时引入第三方仲裁→事后复盘。准备具体案例。' },
  { id: 22, title: 'Why do you want to work here?',          category: 'behavior',  difficulty: '简单', views: 2500, answer: '公司层面（产品/技术/文化）+团队层面（成长空间）+个人层面（职业规划契合）。提前调研公司。' },
  { id: 65, title: '描述一次你主导的技术攻坚经历？',            category: 'behavior',  difficulty: '中等', views: 1900, answer: 'STAR框架。重点：你如何识别问题→拆解任务→推动落地→量化收益。强调主动性和技术判断力。' },
  { id: 66, title: '你如何快速熟悉一个新的代码库？',            category: 'behavior',  difficulty: '简单', views: 1600, answer: '看README/架构文档→了解模块划分→跑通主流程→结合任务深入→与同事沟通。准备具体步骤和工具使用经验。' },
  { id: 67, title: '你的五年职业规划是什么？',                 category: 'behavior',  difficulty: '简单', views: 2200, answer: '1-2年扎实技术基础/深入业务；3-4年技术专家方向或走向管理；5年成为领域专家或Tech Lead。与公司发展结合，不要空泛。' },
  { id: 68, title: '你如何处理 deadline 压力下的优先级排序？', category: 'behavior',  difficulty: '中等', views: 1400, answer: '四象限法（紧急/重要）→与PM沟通需求优先级→砍功能/降质量换时间→提前预警风险。给出一个实际案例。' },
  { id: 69, title: 'Tell me about a time you failed.',       category: 'behavior',  difficulty: '中等', views: 2000, answer: '选真实但有教训的失败案例。结构：背景→决策→结果→复盘→改变。展示成长心态而非推卸责任。' },
  { id: 70, title: '如何在工作中学习新技术？',                 category: 'behavior',  difficulty: '简单', views: 1300, answer: '官方文档→小项目实践→参考优质开源项目→输出（博客/分享）。提到信息来源：技术社区/书籍/会议。' },
  { id: 71, title: '你如何向非技术人员解释复杂技术问题？',      category: 'behavior',  difficulty: '中等', views: 1500, answer: '类比生活（数据库像图书馆）、可视化图示、拆解步骤、避免术语、确认理解。给出一个实际对齐经历。' },
  { id: 72, title: 'Why should we hire you over other candidates?', category: 'behavior', difficulty: '中等', views: 1800, answer: '对应JD核心需求列出匹配点+案例证明。再补充差异化优势（特定技术栈/行业经验）。真诚具体，不要空泛。' },
  { id: 97, title: 'Describe your greatest professional achievement.', category: 'behavior', difficulty: '简单', views: 2100, answer: 'Quantify impact: "reduced load time by 40%", "saved $50k annually". Focus on YOUR specific contribution, technical challenge, and business outcome.' },
  { id: 98, title: 'How do you stay up to date with technology trends?', category: 'behavior', difficulty: '简单', views: 1600, answer: 'Mention specific resources: Hacker News, TLDR newsletter, official docs, conference talks (WWDC/Google I/O), GitHub trending, tech podcasts.' },
  { id: 99, title: 'Describe a time you had to learn something very quickly.', category: 'behavior', difficulty: '中等', views: 1750, answer: 'Structure: what you needed to learn → your strategy (80/20 rule, focused on must-haves) → outcome. Shows learning agility and resourcefulness.' },
  { id: 100,title: '如何平衡技术债务和新功能开发？',            category: 'behavior',  difficulty: '困难', views: 1400, answer: '量化债务成本（开发效率下降/bug率上升）→写进排期（20%时间偿债）→关键路径优先还债→Boy Scout Rule（路过改一点）。给出与PM沟通案例。' },
  // ── Python ────────────────────────────────────────────────
  { id: 23, title: 'Python 的 GIL 是什么？如何解决？',        category: 'python',    difficulty: '中等', views: 1680, answer: 'GIL保证同一时刻只有一个线程执行字节码。解决：multiprocessing、C扩展释放GIL、asyncio协程。' },
  { id: 24, title: 'Python 装饰器的原理和应用？',             category: 'python',    difficulty: '中等', views: 1420, answer: '接收函数返回函数的高阶函数。@decorator语法糖。应用：日志、权限校验、缓存(@lru_cache)、重试。' },
  { id: 25, title: 'Python 列表推导式 vs 生成器表达式？',     category: 'python',    difficulty: '简单', views: 960,  answer: '列表推导一次生成全部数据占内存，生成器惰性求值按需生成省内存。大数据处理用生成器。' },
  { id: 73, title: 'Python 的内存管理机制？',                category: 'python',    difficulty: '中等', views: 1100, answer: '引用计数（主要）+垃圾回收（循环引用）。对象在堆上分配，CPython维护内存池（pymalloc）减少碎片。del降低引用计数，计数为0立即回收。' },
  { id: 74, title: 'Python 中的迭代器和生成器？',             category: 'python',    difficulty: '中等', views: 1050, answer: '迭代器：实现__iter__和__next__的对象。生成器：用yield关键字的函数，惰性求值，省内存。yield from委托子生成器。协程基于生成器。' },
  { id: 75, title: 'Django 和 FastAPI 的区别？',             category: 'python',    difficulty: '中等', views: 1400, answer: 'Django：全栈框架，ORM+模板+Admin，适合大型项目；FastAPI：现代异步框架，高性能，自动OpenAPI文档，类型提示，适合API服务。' },
  { id: 76, title: 'Python 多线程、多进程、协程的适用场景？',  category: 'python',    difficulty: '困难', views: 1600, answer: 'I/O密集型：多线程(threading)或协程(asyncio)；CPU密集型：多进程(multiprocessing)。协程比线程开销更小，推荐用asyncio+aiohttp做高并发IO。' },
  { id: 77, title: 'Python 中的 __slots__ 有什么用？',       category: 'python',    difficulty: '中等', views: 720,  answer: '限制实例属性，禁止使用__dict__，减少内存占用（每实例节省约50字节）。适合创建大量简单对象。副作用：不能动态添加属性。' },
  { id: 78, title: 'Python 如何实现单例模式？',               category: 'python',    difficulty: '中等', views: 850,  answer: '方法1：__new__判断实例；方法2：模块级变量（天然单例）；方法3：装饰器；方法4：元类。注意线程安全需加锁。' },
  { id: 79, title: 'Python 的 with 语句和上下文管理器？',     category: 'python',    difficulty: '简单', views: 920,  answer: '实现__enter__和__exit__协议。with语句保证资源释放（文件/锁/网络连接）。contextlib.contextmanager装饰器可用生成器实现。' },
  // ── 数据库 ────────────────────────────────────────────────
  { id: 26, title: 'MySQL 索引的原理和优化？',                category: 'database',  difficulty: '中等', views: 2100, answer: 'InnoDB用B+树。聚簇索引存完整行，非聚簇索引存主键需回表。覆盖索引避免回表。最左前缀原则。' },
  { id: 27, title: '事务的ACID特性和隔离级别？',               category: 'database',  difficulty: '中等', views: 1750, answer: 'ACID：原子性(undo log)、一致性、隔离性(锁+MVCC)、持久性(redo log)。四个隔离级别解决脏读/不可重复读/幻读。' },
  { id: 28, title: 'SQL 查询优化有哪些常用方法？',             category: 'database',  difficulty: '中等', views: 1380, answer: 'EXPLAIN分析→合理建索引→避免全表扫描→小表驱动大表→分页优化→避免SELECT *→读写分离。' },
  { id: 80, title: 'MySQL 的 MVCC 原理？',                   category: 'database',  difficulty: '困难', views: 1650, answer: 'Multi-Version Concurrency Control。InnoDB为每行维护隐藏字段：trx_id（事务ID）、roll_pointer（回滚指针）。读已提交/可重复读用ReadView快照，根据可见性规则判断读哪个版本。' },
  { id: 81, title: 'Redis 的持久化方式有哪些？',               category: 'database',  difficulty: '中等', views: 1400, answer: 'RDB：定期快照，恢复快，可能丢数据；AOF：记录写命令，持久性更好，文件更大。混合模式（4.0+）：RDB+增量AOF。选择：追求恢复速度用RDB，数据安全用AOF。' },
  { id: 82, title: 'MySQL 主从复制原理？',                    category: 'database',  difficulty: '中等', views: 1200, answer: 'Master写binlog→Slave IO线程读binlog→写relay log→SQL线程执行relay log。延迟优化：并行复制（逻辑时钟/WRITESET）、半同步复制。' },
  { id: 83, title: '什么是数据库的三范式？',                  category: 'database',  difficulty: '简单', views: 980,  answer: '1NF：列不可再分（原子性）；2NF：非主属性完全依赖主键（消除部分依赖）；3NF：非主属性直接依赖主键（消除传递依赖）。反范式化可提升查询性能。' },
  { id: 84, title: 'MongoDB 和 MySQL 的适用场景？',           category: 'database',  difficulty: '中等', views: 1100, answer: 'MongoDB：文档型，Schema灵活，适合非结构化/半结构化数据（商品SKU、日志、内容管理）；MySQL：关系型，强一致性，适合事务性业务（订单、支付）。' },
  { id: 85, title: 'Redis 缓存与数据库一致性如何保证？',       category: 'database',  difficulty: '困难', views: 1900, answer: '方案：先更新DB再删缓存（最常用）；延迟双删；订阅binlog异步更新（Canal）。注意并发下读写穿透、布隆过滤器防缓存穿透、互斥锁防缓存击穿。' },
  { id: 86, title: '什么是慢查询？如何定位和优化？',           category: 'database',  difficulty: '中等', views: 1300, answer: 'slow_query_log开启，long_query_time设阈值。定位：EXPLAIN查执行计划，关注type(全表扫描→ref/range→const)、Extra(filesort/Using temporary)。优化：加索引、改写SQL、覆盖索引。' }
];

// ══════════════════════════════════════════════════════════════
// 求职机构兜底数据
// ══════════════════════════════════════════════════════════════
const AGENCIES = [
  { id: 1, name: '启程留学求职中心', type: '综合', city: '北京', description: '专注北美/英国留学生求职，提供简历优化、面试培训和全程陪跑服务。', ratingAvg: 4.6, reviewCount: 128, priceRange: '5000-15000', specialties: ['金融', '咨询', '互联网'], isVerified: false },
  { id: 2, name: '跨境猎头精英',     type: '猎头', city: '上海', description: '专业从事海外华人回国就业及外资企业人才猎取，10年行业经验。',        ratingAvg: 4.4, reviewCount: 87,  priceRange: '0（企业付费）', specialties: ['金融', '咨询', '快消'], isVerified: false },
  { id: 3, name: '简历工坊',         type: '简历优化', city: '线上', description: '专业简历顾问团队，曾服务 2000+ 留学生，投递通过率提升 40%。',   ratingAvg: 4.8, reviewCount: 312, priceRange: '800-3000',  specialties: ['技术', '产品', '数据'], isVerified: false },
  { id: 4, name: '面试魔方',         type: '面试培训', city: '线上', description: '提供 case interview / behavioral / technical 全类型模拟面试。', ratingAvg: 4.5, reviewCount: 204, priceRange: '1200-6000', specialties: ['咨询', '金融', '科技'], isVerified: false },
  { id: 5, name: '留学工坊',         type: '留学咨询', city: '广州', description: '从选校申请到毕业求职的一站式留学生服务平台，签约率 95%+。',       ratingAvg: 4.2, reviewCount: 56,  priceRange: '3000-20000', specialties: ['英国', '北美', '澳洲'], isVerified: false },
  { id: 6, name: '背景加速器',       type: '背景提升', city: '线上', description: '提供科研、实习内推和竞赛项目包装，提升申请竞争力。',               ratingAvg: 4.0, reviewCount: 43,  priceRange: '2000-8000',  specialties: ['科研', '实习', '项目'], isVerified: false }
];

// ══════════════════════════════════════════════════════════════
// 校招时间线兜底数据
// ══════════════════════════════════════════════════════════════
const CAMPUS = [
  { id: 1,  company: '字节跳动', companyLogo: '', region: '中国内地', positionType: '技术',   recruitYear: 2025, appOpenMonth: '2025-08', deadlineMonth: '2025-10', offerMonth: '2025-11', recruitType: '秋招',   writtenTest: '含免笔试', notes: 'OC可投，有海外岗位', isVerified: true  },
  { id: 2,  company: '腾讯',    companyLogo: '', region: '中国内地', positionType: '技术',   recruitYear: 2025, appOpenMonth: '2025-09', deadlineMonth: '2025-10', offerMonth: '2025-11', recruitType: '秋招',   writtenTest: '需要笔试', notes: '校园招聘岗位丰富',   isVerified: true  },
  { id: 3,  company: '阿里巴巴', companyLogo: '', region: '中国内地', positionType: '产品',   recruitYear: 2025, appOpenMonth: '2025-08', deadlineMonth: '2025-09', offerMonth: '2025-10', recruitType: '秋招',   writtenTest: '含免笔试', notes: '留学生绿色通道',     isVerified: true  },
  { id: 4,  company: 'Google',  companyLogo: '', region: '北美',     positionType: '技术',   recruitYear: 2025, appOpenMonth: '2025-09', deadlineMonth: '2025-11', offerMonth: '2026-01', recruitType: '秋招',   writtenTest: '仅测评',   notes: 'OPT/CPT 均可',      isVerified: true  },
  { id: 5,  company: 'Amazon',  companyLogo: '', region: '北美',     positionType: '技术',   recruitYear: 2025, appOpenMonth: '2025-08', deadlineMonth: '2025-11', offerMonth: '2026-01', recruitType: '秋招',   writtenTest: '仅测评',   notes: '提前批截止更早',     isVerified: true  },
  { id: 6,  company: 'Meta',    companyLogo: '', region: '北美',     positionType: '数据',   recruitYear: 2025, appOpenMonth: '2025-09', deadlineMonth: '2025-12', offerMonth: '2026-02', recruitType: '秋招',   writtenTest: '仅测评',   notes: '强 Sponsor H1B',    isVerified: false },
  { id: 7,  company: '美团',    companyLogo: '', region: '中国内地', positionType: '运营',   recruitYear: 2025, appOpenMonth: '2025-03', deadlineMonth: '2025-04', offerMonth: '2025-05', recruitType: '春招',   writtenTest: '需要笔试', notes: '春招坑位较少',       isVerified: true  },
  { id: 8,  company: 'Goldman Sachs', companyLogo: '', region: '北美', positionType: '金融', recruitYear: 2025, appOpenMonth: '2025-07', deadlineMonth: '2025-08', offerMonth: '2025-10', recruitType: '暑期实习', writtenTest: '含免笔试', notes: 'SA 提前批',         isVerified: true  },
  { id: 9,  company: 'McKinsey', companyLogo: '', region: '北美',    positionType: '咨询',   recruitYear: 2025, appOpenMonth: '2025-09', deadlineMonth: '2025-10', offerMonth: '2025-12', recruitType: '秋招',   writtenTest: '仅测评',   notes: 'Problem Solving Test', isVerified: true },
  { id: 10, company: '华为',    companyLogo: '', region: '中国内地', positionType: '技术',   recruitYear: 2025, appOpenMonth: '2025-08', deadlineMonth: '2025-10', offerMonth: '2025-11', recruitType: '秋招',   writtenTest: '需要笔试', notes: '海外留学生专项',     isVerified: true  }
];

module.exports = {
  JOBS,
  RECOMMEND_JOBS,
  COMPANIES,
  EXPERIENCES,
  SALARY_ROLES,
  SALARY_COMPANIES,
  SALARY_CN_MAP,
  APPLICATIONS,
  NEWS_FEED,
  QUESTIONS,
  AGENCIES,
  CAMPUS,
  COMPANY_SALARY_BASE
};
