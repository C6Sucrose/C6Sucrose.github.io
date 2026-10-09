export const profile = {
  name: 'Huraira Ali',
  email: 'huraira.ali.prof@proton.me',
  location: 'Munich, Germany',
  github: 'https://github.com/C6Sucrose',
  linkedin: 'https://linkedin.com/in/huraira-ali-234056222',
  cv: '/downloads/huraira-ali-cv.pdf',
  certificatesFile: '/downloads/huraira-ali-certificates.pdf',
  about: 'I’m an Artificial Intelligence student at Deggendorf Institute of Technology, building LLM workflows, computer-vision experiments, and the software around them. I’m interested in how ideas become useful systems — and how you tell whether those systems actually work.',
  background: 'Before this, I co-founded Eule, a software agency working with clients around the world. That experience brought me close to the whole process: understanding a problem, building a solution, shipping it, and helping someone use it. I bring that practical side to my AI work.',
  stats: [{ value: '16+', label: 'applications shipped' }, { value: '40k+', label: 'end users served' }, { value: '12', label: 'countries reached' }],
  experience: [
    { date: 'Oct 2023 — Jan 2025', title: 'Software Engineer / Co-founder', place: 'Eule (Software Development Services)', detail: 'Delivered React and Flutter applications across 23 client engagements. Worked across requirements, UX, implementation, cloud deployment, and support; built dashboards around user metrics and Stripe / RevenueCat billing data.' },
    { date: '2022 & 2023', title: 'Game development & gamified applications', place: 'Mindstorm Studios · Lahore', detail: 'Internship and junior-development experience with Unity3D, cross-platform applications, and team delivery. Completed the 2023 summer program and participated in Rookie Game Jam.' },
    { date: 'Feb — Jun 2023', title: 'Business intelligence & governance study', place: 'Systems Limited · research engagement', detail: 'Conducted stakeholder interviews and management presentations during a five-month organizational study. Documented governance, resource allocation, and cross-department decision-making. An academic research engagement, not an employment role.' },
  ],
  education: [
    { date: 'Oct 2023 — present', title: 'B.Sc. Artificial Intelligence', place: 'Deggendorf Institute of Technology · Germany', detail: 'Expected graduation: September 2027. Focus on data science, computer vision, LLM applications, privacy, and MLOps. Oskar-Karl scholarship recipient. Coursework spans AI programming, machine learning, NLP, software engineering, and deep learning / big data.' },
    { date: 'Sep 2021 — Jun 2023', title: 'Computer Science studies', place: 'FAST–NUCES · Islamabad, Pakistan', detail: 'Completed four semesters before transferring to DIT. Received a 50% scholarship. Participated in the Google Developer Student Club, FAST Computing Society, conventions, and game-development events.' },
    { date: '2017 — 2021', title: 'Cambridge O & A Levels', place: 'Edward’s School & College · Peshawar', detail: 'Literature Club member and Head Proctor during O Levels — early opportunities to practice communication and responsibility.' },
  ],
  skills: [
    { title: 'AI & applied ML', tools: 'Python · PyTorch · TensorFlow / Keras · scikit-learn · Pandas · NumPy · Hugging Face · Stable Diffusion · ControlNet', proof: 'See the vision benchmark', href: '/projects/anon4reid/' },
    { title: 'Agents & applications', tools: 'TypeScript · LangGraph · LangChain · MCP · OpenAI / Anthropic SDKs · FastAPI · React · Next.js · Streamlit · Flutter', proof: 'See the accessible agent', href: '/projects/wayfinder/' },
    { title: 'Data & infrastructure', tools: 'SQL · PostgreSQL / Supabase · ChromaDB · Firebase · Docker · GitHub Actions · GCP · AWS · MLflow', proof: 'See the release pipeline', href: '/projects/app-factory/' },
    { title: 'Testing & exploration', tools: 'Vitest · node:test · pytest · Playwright · model evaluation · CUDA Python training · C++ coursework · technical documentation', proof: 'Browse the project library', href: '/#work' },
  ],
  certificates: [
    { title: 'Generative AI with Diffusion Models', issuer: 'NVIDIA', date: 'Mar 2026', page: 1 },
    { title: 'Exploring Adversarial Machine Learning', issuer: 'NVIDIA', date: 'Feb 2026', page: 2 },
    { title: 'Getting Started with Deep Learning', issuer: 'NVIDIA', date: 'Mar 2026', page: 3 },
    { title: 'Introduction to Transformer-Based Natural Language Processing', issuer: 'NVIDIA', date: 'Mar 2026', page: 4 },
    { title: 'Fundamentals of Accelerated Computing with CUDA Python', issuer: 'NVIDIA', date: 'Mar 2026', page: 5 },
    { title: 'Summer Program & Rookie Game Jam', issuer: 'Mindstorm Studios', date: '2023', page: 6 },
  ],
  coursework: ['Computer Vision', 'Deep Learning / Big Data', 'Quantum Computing', 'Programming in C++'],
  testimonials: [
    { quote: 'Excellent communication and first class', author: 'duncanmooregolf', location: 'United Kingdom' },
    { quote: 'Was able to come up with a solution to a relatively complex problem in a short period of time.', author: 'joshfarmiloe', location: 'United States' },
    { quote: 'They have a lot of knowledge and expertise. They really exceeded my expectations.', author: 'creativelizanne', location: 'Netherlands' },
  ],
};

export function requestAccess(project: string) {
  return `mailto:${profile.email}?subject=${encodeURIComponent(`${project} — repository access / walkthrough`)}&body=${encodeURIComponent(`Hello Huraira,\n\nI'd like to review ${project}. Could you share access or arrange a walkthrough?\n\nMy GitHub username: \n`)}`;
}
