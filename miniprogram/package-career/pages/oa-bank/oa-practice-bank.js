// 通用原创模拟题。不是企业真题，也不写入本人 OA 训练记录。
const TYPES = [
  { value: 'all', label: '全部' },
  { value: 'numerical', label: '数理与图表' },
  { value: 'logical', label: '逻辑推理' },
  { value: 'verbal', label: '言语理解' },
  { value: 'situational', label: '情景判断' },
  { value: 'case', label: 'Case Study' },
  { value: 'algorithm', label: '算法编程' },
  { value: 'technical', label: '专业知识' }
];

const QUESTIONS = [
  { id: 'num-1', type: 'numerical', stem: '某岗位上周收到 80 份申请，本周收到 100 份。申请量增长了多少？', choices: ['20%', '25%', '80%', '125%'], answerIndex: 1, explanation: '增长率 = (100 − 80) ÷ 80 = 25%。' },
  { id: 'num-2', type: 'numerical', stem: '周一、周二、周三分别有 120、150、130 人完成测评。三天总人数是多少？', choices: ['370', '390', '400', '420'], answerIndex: 2, explanation: '120 + 150 + 130 = 400。' },
  { id: 'num-3', type: 'numerical', stem: 'A 组完成 120 单，客单价 50 元；B 组完成 150 单，客单价 40 元。哪组收入更高？', choices: ['A 组', 'B 组', '两组相同', '无法判断'], answerIndex: 2, explanation: 'A 组收入为 120 × 50 = 6000 元；B 组为 150 × 40 = 6000 元。' },
  { id: 'log-1', type: 'logical', stem: '数列 2、6、12、20、30 的下一项是多少？', choices: ['36', '40', '42', '44'], answerIndex: 2, explanation: '相邻差依次为 4、6、8、10，下一次增加 12，因此是 42。' },
  { id: 'log-2', type: 'logical', stem: '已知“所有 A 都是 B”且“有些 B 是 C”。以下哪项一定成立？', choices: ['有些 A 是 C', '所有 C 都是 A', '所有 A 都是 C', '无法判断 A 与 C 是否相交'], answerIndex: 3, explanation: '有些 B 属于 C，并不能保证这些 B 同时属于 A。' },
  { id: 'log-3', type: 'logical', stem: '甲、乙、丙分别在周一、周二、周三面试，每人一天。乙在周三，甲不在周一。丙在哪天？', choices: ['周一', '周二', '周三', '无法确定'], answerIndex: 0, explanation: '乙占周三；甲不能在周一，只能在周二，所以丙在周一。' },
  { id: 'verb-1', type: 'verbal', stem: '一份报告只统计了主动填写练习结果的用户。根据这句话，以下哪项可以确定？', choices: ['所有用户都完成了练习', '未填写结果的用户没有进入该统计', '未填写结果的用户成绩更差', '报告覆盖全部练习记录'], answerIndex: 1, explanation: '统计范围明确限定为主动填写结果的用户，不能推断其他用户的成绩。' },
  { id: 'verb-2', type: 'verbal', stem: '“线上测评可以减少安排场地的时间，但需要保证设备和网络稳定。”这句话主要强调什么？', choices: ['线上测评没有优点', '线上测评只适合技术岗位', '线上测评有便利性，也有实施条件', '场地安排最重要'], answerIndex: 2, explanation: '前半句是便利性，后半句是顺利实施所需的条件。' },
  { id: 'verb-3', type: 'verbal', stem: '某通知写道：“请在周五 18:00 前提交材料，逾期系统将关闭入口。”以下理解正确的是？', choices: ['周五全天都能提交', '截止后可通过原入口补交', '应在周五 18:00 前完成提交', '只需在周五开始填写'], answerIndex: 2, explanation: '通知给出了明确的提交截止时间和入口关闭条件。' },
  { id: 'sit-1', type: 'situational', stem: '团队临近截止时收到一项新增需求，可能影响原定交付。你会先怎么做？', choices: ['不告知任何人直接加班', '先确认优先级与影响，再同步调整方案', '立即放弃原任务', '等截止后再说明'], answerIndex: 1, explanation: '先澄清优先级、评估影响并同步相关人，才能做有依据的取舍。' },
  { id: 'sit-2', type: 'situational', stem: '提交分析结果前，你发现一处会影响结论的数据错误。最合适的处理是？', choices: ['忽略，因为报告快完成了', '只修改最终数字，不留记录', '暂停提交，核对并说明修正影响', '让别人承担责任'], answerIndex: 2, explanation: '应先核实错误并透明说明对结论的影响。' },
  { id: 'sit-3', type: 'situational', stem: '同事请你通过私人聊天工具发送候选人的联系方式。你应该怎么做？', choices: ['直接发送以节省时间', '仅发送部分号码', '确认授权并使用规定的共享渠道', '公开发到工作群'], answerIndex: 2, explanation: '候选人信息应按授权范围和规定渠道处理。' },
  { id: 'case-1', type: 'case', stem: '某页面有 8000 次访问，申请转化率为 6%。预计产生多少份申请？', choices: ['48', '460', '480', '800'], answerIndex: 2, explanation: '8000 × 6% = 480。' },
  { id: 'case-2', type: 'case', stem: '订单数增长 20%，平均订单金额下降 10%，其他条件不变。总收入变化约为多少？', choices: ['下降 10%', '不变', '增长 8%', '增长 10%'], answerIndex: 2, explanation: '新收入为原来的 1.2 × 0.9 = 1.08 倍，即增长 8%。' },
  { id: 'case-3', type: 'case', stem: '新用户留存率在改版后下降。分析时最适合先做什么？', choices: ['立即撤回所有改动', '按新老版本和用户群分组核对数据', '只看总用户数', '直接归因于推广渠道'], answerIndex: 1, explanation: '先核对分组与口径，再定位变化发生在哪些人群和环节。' },
  { id: 'alg-1', type: 'algorithm', stem: '在已经排序的数组中使用二分查找，最坏时间复杂度通常是多少？', choices: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], answerIndex: 1, explanation: '每次比较后搜索范围约减半，因此是 O(log n)。' },
  { id: 'alg-2', type: 'algorithm', stem: '用哈希表寻找数组中两数之和等于目标值，通常可以把平均时间复杂度降到多少？', choices: ['O(1)', 'O(log n)', 'O(n)', 'O(n²)'], answerIndex: 2, explanation: '遍历数组时在哈希表中查找互补值，平均每次查找为常数时间，总体为 O(n)。' },
  { id: 'alg-3', type: 'algorithm', stem: '在边权相同的无向图中求起点到各节点的最少边数，适合使用什么算法？', choices: ['广度优先搜索', '二分查找', '快速排序', '深度优先搜索后取第一个结果'], answerIndex: 0, explanation: '广度优先搜索按距离层级扩展，首次到达节点时得到最少边数。' },
  { id: 'tech-1', type: 'technical', stem: '要统计数据库中每家公司对应的岗位数量，SQL 通常应使用哪种组合？', choices: ['ORDER BY + LIMIT', 'GROUP BY + COUNT(*)', 'DISTINCT + DELETE', 'JOIN + UPDATE'], answerIndex: 1, explanation: '按公司 GROUP BY 分组，再用 COUNT(*) 统计每组行数。' },
  { id: 'tech-2', type: 'technical', stem: '请求的资源在服务器上不存在时，HTTP 常见状态码是哪一个？', choices: ['200', '301', '404', '500'], answerIndex: 2, explanation: '404 表示请求的资源未找到。' },
  { id: 'tech-3', type: 'technical', stem: '用户更新资料后仍看到缓存的旧内容。以下哪种做法更直接针对缓存一致性？', choices: ['增大字体', '更新后失效对应缓存或使用版本键', '延长缓存时间', '删除数据库索引'], answerIndex: 1, explanation: '更新后使旧缓存失效，或使用新版本键，可以避免继续读取旧数据。' }
];

function forType(type) {
  return QUESTIONS.filter(question => type === 'all' || question.type === type);
}

function isCorrect(question, answerIndex) {
  return !!question && Number.isInteger(answerIndex) && answerIndex === question.answerIndex;
}

module.exports = { TYPES, QUESTIONS, forType, isCorrect };
