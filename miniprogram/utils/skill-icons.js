// utils/skill-icons.js
// 从职位描述中提取技术标签，附带 Devicon / Simple Icons CDN 图标 URL

const DEVICON = 'https://cdn.jsdelivr.net/gh/devicons/devicon@latest/icons';
const SIMPLEICONS = 'https://cdn.simpleicons.org';

// skill keyword → { label, iconUrl }
// 关键词按"先长后短"排列，避免 "javascript" 被 "java" 抢先匹配
const SKILL_MAP = [
  // ── 语言 ──
  { keys: ['typescript','ts ','\.ts\b'],  label: 'TypeScript', url: `${DEVICON}/typescript/typescript-original.svg` },
  { keys: ['javascript','js ','\.js\b'],  label: 'JavaScript', url: `${DEVICON}/javascript/javascript-original.svg` },
  { keys: ['python'],                      label: 'Python',     url: `${DEVICON}/python/python-original.svg` },
  { keys: ['golang','\\bgo\\b'],           label: 'Go',         url: `${DEVICON}/go/go-original.svg` },
  { keys: ['kotlin'],                      label: 'Kotlin',     url: `${DEVICON}/kotlin/kotlin-original.svg` },
  { keys: ['swift'],                       label: 'Swift',      url: `${DEVICON}/swift/swift-original.svg` },
  { keys: ['\\bjava\\b'],                  label: 'Java',       url: `${DEVICON}/java/java-original.svg` },
  { keys: ['scala'],                       label: 'Scala',      url: `${DEVICON}/scala/scala-original.svg` },
  { keys: ['rust'],                        label: 'Rust',       url: `${DEVICON}/rust/rust-original.svg` },
  { keys: ['ruby'],                        label: 'Ruby',       url: `${DEVICON}/ruby/ruby-original.svg` },
  { keys: ['\\bphp\\b'],                   label: 'PHP',        url: `${DEVICON}/php/php-original.svg` },
  { keys: ['c\\+\\+','cpp'],              label: 'C++',        url: `${DEVICON}/cplusplus/cplusplus-original.svg` },
  { keys: ['c#','csharp'],               label: 'C#',         url: `${DEVICON}/csharp/csharp-original.svg` },
  { keys: ['\\br\\b','rstudio'],          label: 'R',          url: `${DEVICON}/r/r-original.svg` },
  // ── 前端框架 ──
  { keys: ['react'],                       label: 'React',      url: `${DEVICON}/react/react-original.svg` },
  { keys: ['next\\.?js','nextjs'],         label: 'Next.js',    url: `${DEVICON}/nextjs/nextjs-original.svg` },
  { keys: ['vue\\.?js','vuejs','\\bvue\\b'], label: 'Vue',      url: `${DEVICON}/vuejs/vuejs-original.svg` },
  { keys: ['angular'],                     label: 'Angular',    url: `${DEVICON}/angularjs/angularjs-original.svg` },
  { keys: ['svelte'],                      label: 'Svelte',     url: `${DEVICON}/svelte/svelte-original.svg` },
  // ── 后端框架 ──
  { keys: ['node\\.?js','nodejs'],         label: 'Node.js',    url: `${DEVICON}/nodejs/nodejs-original.svg` },
  { keys: ['django'],                      label: 'Django',     url: `${DEVICON}/django/django-plain.svg` },
  { keys: ['flask'],                       label: 'Flask',      url: `${DEVICON}/flask/flask-original.svg` },
  { keys: ['spring'],                      label: 'Spring',     url: `${DEVICON}/spring/spring-original.svg` },
  { keys: ['fastapi'],                     label: 'FastAPI',    url: `${SIMPLEICONS}/fastapi` },
  // ── 数据库 ──
  { keys: ['postgresql','postgres'],       label: 'PostgreSQL', url: `${DEVICON}/postgresql/postgresql-original.svg` },
  { keys: ['mysql'],                       label: 'MySQL',      url: `${DEVICON}/mysql/mysql-original.svg` },
  { keys: ['mongodb','mongo'],             label: 'MongoDB',    url: `${DEVICON}/mongodb/mongodb-original.svg` },
  { keys: ['redis'],                       label: 'Redis',      url: `${DEVICON}/redis/redis-original.svg` },
  { keys: ['elasticsearch'],               label: 'Elasticsearch', url: `${DEVICON}/elasticsearch/elasticsearch-original.svg` },
  { keys: ['cassandra'],                   label: 'Cassandra',  url: `${DEVICON}/cassandra/cassandra-original.svg` },
  { keys: ['sqlite'],                      label: 'SQLite',     url: `${DEVICON}/sqlite/sqlite-original.svg` },
  { keys: ['\\bsql\\b'],                   label: 'SQL',        url: `${DEVICON}/azuresqldatabase/azuresqldatabase-original.svg` },
  // ── 云 / DevOps ──
  { keys: ['kubernetes','k8s'],            label: 'Kubernetes', url: `${DEVICON}/kubernetes/kubernetes-original.svg` },
  { keys: ['docker'],                      label: 'Docker',     url: `${DEVICON}/docker/docker-original.svg` },
  { keys: ['terraform'],                   label: 'Terraform',  url: `${DEVICON}/terraform/terraform-original.svg` },
  { keys: ['\\baws\\b','amazon web services'], label: 'AWS',    url: `${DEVICON}/amazonwebservices/amazonwebservices-original-wordmark.svg` },
  { keys: ['\\bgcp\\b','google cloud'],    label: 'GCP',        url: `${DEVICON}/googlecloud/googlecloud-original.svg` },
  { keys: ['azure'],                       label: 'Azure',      url: `${DEVICON}/azure/azure-original.svg` },
  { keys: ['linux'],                       label: 'Linux',      url: `${DEVICON}/linux/linux-original.svg` },
  { keys: ['\\bgit\\b'],                   label: 'Git',        url: `${DEVICON}/git/git-original.svg` },
  { keys: ['github'],                      label: 'GitHub',     url: `${DEVICON}/github/github-original.svg` },
  { keys: ['gitlab'],                      label: 'GitLab',     url: `${DEVICON}/gitlab/gitlab-original.svg` },
  // ── AI / 数据科学 ──
  { keys: ['tensorflow'],                  label: 'TensorFlow', url: `${DEVICON}/tensorflow/tensorflow-original.svg` },
  { keys: ['pytorch'],                     label: 'PyTorch',    url: `${DEVICON}/pytorch/pytorch-original.svg` },
  { keys: ['pandas'],                      label: 'Pandas',     url: `${DEVICON}/pandas/pandas-original.svg` },
  { keys: ['numpy'],                       label: 'NumPy',      url: `${DEVICON}/numpy/numpy-original.svg` },
  { keys: ['spark'],                       label: 'Spark',      url: `${SIMPLEICONS}/apachespark` },
  { keys: ['kafka'],                       label: 'Kafka',      url: `${SIMPLEICONS}/apachekafka` },
  { keys: ['airflow'],                     label: 'Airflow',    url: `${SIMPLEICONS}/apacheairflow` },
  // ── 移动端 ──
  { keys: ['flutter'],                     label: 'Flutter',    url: `${DEVICON}/flutter/flutter-original.svg` },
  { keys: ['react native'],                label: 'React Native', url: `${DEVICON}/react/react-original.svg` },
  { keys: ['android'],                     label: 'Android',    url: `${DEVICON}/android/android-original.svg` },
  // ── 设计 ──
  { keys: ['figma'],                       label: 'Figma',      url: `${DEVICON}/figma/figma-original.svg` },
];

/**
 * 从职位描述中提取技术标签，最多返回 8 个
 * @param {string} description
 * @returns {Array<{label:string, iconUrl:string}>}
 */
function extractSkillTags(description) {
  if (!description) return [];
  const text = description.toLowerCase();
  const found = [];
  const seen  = new Set();

  for (const skill of SKILL_MAP) {
    if (found.length >= 8) break;
    for (const key of skill.keys) {
      if (seen.has(skill.label)) break;
      try {
        if (new RegExp(key, 'i').test(text)) {
          seen.add(skill.label);
          found.push({ label: skill.label, iconUrl: skill.url });
          break;
        }
      } catch (_) { /* 正则异常跳过 */ }
    }
  }
  return found;
}

module.exports = { extractSkillTags };
