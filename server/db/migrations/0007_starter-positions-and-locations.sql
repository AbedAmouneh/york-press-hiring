-- Starter data, written once: 29 positions York Press hires for (8 from its live LinkedIn postings, 21 drafted in
-- the same style) and the 11 places it hires. After this, both lists are kept in Settings. ON CONFLICT keeps anything
-- already added by hand.
INSERT INTO "positions" ("title", "department", "seniority", "must_haves", "nice_to_haves", "languages", "min_years", "ideal_years", "jd_text") VALUES
  ('.NET Backend Developer', 'Product & Technology', 'Mid', ARRAY['C# and ASP.NET Core', 'REST API design', 'PostgreSQL or another relational database, SQL', 'Entity Framework Core', 'Authentication and role-based authorization', 'Git', 'C# (2+ years)', '.NET (2+ years)']::text[], ARRAY['Redis or other caching', 'Background jobs (e.g. Hangfire)', 'Docker and Linux deployment', 'Nginx', 'S3-compatible object storage', 'GitLab CI/CD', 'OpenAPI / Swagger', 'Education, assessment or examination systems']::text[], ARRAY['English']::text[], 2, 5, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Build and maintain a robust education and assessment platform with ASP.NET Core, C# and PostgreSQL: secure, scalable APIs and complex workflows with a strong focus on data integrity, transactional reliability and performance.

Responsibilities
- Design and build backend services and REST APIs in ASP.NET Core and C#
- Design and maintain relational data models in PostgreSQL
- Implement authentication, role-based authorization and access control
- Build reliable transactional operations for marks, allocations, reviews and other examination data
- Run background processing for reports, bulk imports and statistics
- Integrate file/object storage for large volumes of scanned images
- Implement audit trails, data-integrity checks and verified report exports
- Write automated tests, take part in code reviews and architecture decisions
- Work closely with frontend, UI/UX and QA colleagues

Requirements
- Strong C# and ASP.NET Core
- Good REST API and HTTP design
- Strong SQL and relational modelling; PostgreSQL or similar
- Entity Framework Core or a similar ORM
- Transactions, concurrency and asynchronous programming in .NET
- Clean, testable, object-oriented code and Git
- 2+ years with C# and .NET

Nice to have
- Redis, Hangfire, Docker, Linux, Nginx
- S3-compatible storage, message queues, WebSockets
- OpenAPI, automated testing, GitLab CI/CD
- High-volume transactional, education or examination systems$jd$),
  ('Django Backend Developer', 'Product & Technology', 'Mid', ARRAY['Django / Django REST Framework (3+ years)', 'Python', 'REST API design', 'SQL and database design', 'Git', 'Docker', 'Redis and Celery', 'Bachelor''s degree in Computer Science or related', 'Microsoft Office, Word and PowerPoint (2+ years)']::text[], ARRAY['pytest or unittest', 'CI/CD pipelines', 'E-learning or education products']::text[], ARRAY['English']::text[], 3, 5, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Develop and maintain the REST APIs behind our e-learning products using Django REST Framework, working closely with frontend developers and product stakeholders.

Responsibilities
- Develop and maintain RESTful APIs with Django REST Framework
- Design, optimise and manage relational database schemas
- Write clean, maintainable, well-tested Python
- Take part in code reviews, testing and CI/CD
- Troubleshoot and resolve backend issues in production
- Keep backend systems fast and responsive

Requirements
- Bachelor's degree in Computer Science or a related field
- 3+ years with Django / Django REST Framework
- Strong Python
- REST API design and implementation
- Solid SQL and database design
- Git
- Docker in development and deployment
- Redis and Celery for asynchronous tasks
- Testing frameworks such as pytest or unittest

Nice to have
- Modern CI/CD workflows$jd$),
  ('Frontend Developer (React)', 'Product & Technology', 'Mid', ARRAY['React', 'TypeScript and JavaScript', 'REST API integration', 'HTML and CSS', 'Complex forms and data-driven interfaces', 'Authentication in web apps', 'Git', 'JavaScript (2+ years)']::text[], ARRAY['Material UI or another React component library', 'TanStack Query', 'Large data grids', 'Canvas, SVG or image viewers (zoom, pan, overlays)', 'Zustand or Redux Toolkit', 'React Hook Form', 'Accessibility (WCAG 2.2)', 'Vitest, Jest or Playwright', 'Arabic / right-to-left interfaces', 'Education or assessment systems']::text[], ARRAY['English']::text[], 2, 5, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Design and build responsive, accessible React and TypeScript interfaces for our examination and e-learning systems, integrated with an ASP.NET Core REST backend.

Responsibilities
- Build reusable, well-structured UI components in React and TypeScript
- Integrate with REST APIs and handle errors, loading and network interruptions gracefully
- Build exam and question management, marker allocation and moderation workflows
- Build dashboards, reports, tables, filters and progress indicators
- Implement role-based interfaces for administrators, coordinators, markers and reviewers
- Keep the app fast with large datasets and high-resolution scanned exam images
- Write automated frontend tests and take part in code reviews

Requirements
- Strong JavaScript and TypeScript
- Strong practical React: components, hooks and state
- REST API integration
- Strong HTML and CSS, responsive design
- Complex forms and data-driven UIs
- Authentication and authorization in web apps
- Git

Nice to have
- MUI, TanStack Query, advanced data grids
- Image viewers with zoom, pan and coordinate-based regions
- Zustand or Redux Toolkit, React Hook Form
- WCAG 2.2, Vitest/Jest/Playwright
- Internationalisation and right-to-left layouts$jd$),
  ('AI Engineer', 'Product & Technology', 'Senior', ARRAY['5+ years software engineering', '2+ years shipping AI/ML features to real users', 'Python (production-grade)', 'Large language models, RAG and embeddings', 'Machine-learning fundamentals', 'Evaluating AI output quality', 'Explaining AI decisions to non-technical people']::text[], ARRAY['Adaptive learning, knowledge tracing or IRT', 'Learning science or psychometrics', 'Self-hosted or fine-tuned models', 'MLOps and cost control', 'Arabic or multilingual NLP', 'Education or e-learning', 'Inference serving (vLLM, TGI, Triton)']::text[], ARRAY['English']::text[], 5, 8, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Build and own the AI and adaptive-learning layer of our e-learning products, choosing the right technique for each problem and proving its value with evidence.

Responsibilities
- Plan and deliver the AI and adaptive-learning roadmap
- Build AI features end to end with LLMs, retrieval, ML models and classical techniques
- Own the adaptive learning engine: learning paths, mastery tracking, difficulty and remediation
- Define content metadata and learning-data foundations with content and product teams
- Ground AI in our own content and data, safely and accurately
- Evaluate self-hosted and API models on quality, cost and privacy
- Set responsible-AI practices for student data and young learners
- Measure impact on learning outcomes and report it clearly
- Mentor a junior AI engineer and document the work

Requirements
- 5+ years of software engineering, 2+ building AI/ML features that shipped to real users
- Strong Python and breadth across LLMs, retrieval, embeddings and ML
- A rigorous approach to evaluation and learning impact
- Clear communication with non-technical stakeholders and editorial teams
- A responsible approach to data and privacy for children

Nice to have
- Knowledge tracing, IRT, computer-adaptive testing
- Fine-tuning, MLOps, inference optimisation
- Arabic or multilingual NLP
- Education or content-heavy platforms$jd$),
  ('Junior AI Engineer / Data Scientist', 'Product & Technology', 'Junior', ARRAY['Python', 'Machine-learning basics (scikit-learn or PyTorch)', 'SQL and pandas', 'LLM APIs and prompt engineering basics', 'Bachelor''s degree in Computer Science, Data Science or related']::text[], ARRAY['Retrieval-augmented generation and embeddings', 'Arabic NLP', 'Docker', 'Education data or learning analytics']::text[], ARRAY['English']::text[], 0, 2, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Work with our AI Engineer on the AI and adaptive-learning features of our e-learning products, from data preparation to evaluated, production-ready features.

Responsibilities
- Prepare and analyse learning and content data
- Build and evaluate ML models and LLM-based features
- Build evaluation datasets and run experiments
- Write clean Python and document results
- Report findings clearly to the team

Requirements
- Degree in Computer Science, Data Science, Mathematics or related
- Python, pandas and SQL
- Machine-learning fundamentals
- Curiosity about LLMs and how to evaluate them

Nice to have
- RAG, embeddings or vector databases
- Arabic NLP
- Docker and Git$jd$),
  ('QA / Test Automation Engineer', 'Product & Technology', 'Mid', ARRAY['Test automation (Playwright, Cypress or Selenium)', 'API testing', 'Test plans and test cases', 'CI pipelines', 'Git']::text[], ARRAY['TypeScript or C#', 'Performance testing', 'Accessibility testing', 'Arabic / right-to-left testing', 'Education or examination systems']::text[], ARRAY['English']::text[], 2, 5, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Own the quality of our examination and e-learning platforms by building automated tests and working with developers from design to release.

Responsibilities
- Write test plans and test cases from requirements
- Build and maintain automated UI and API tests
- Run tests in CI and report results clearly
- Reproduce, document and follow up defects
- Check accessibility and right-to-left layouts

Requirements
- 2+ years in software QA
- Automation with Playwright, Cypress or Selenium
- API testing (e.g. Postman or code-based)
- CI pipelines and Git

Nice to have
- Performance and security testing
- TypeScript or C#$jd$),
  ('DevOps / IT Engineer', 'Product & Technology', 'Mid', ARRAY['Linux administration', 'Docker', 'CI/CD (GitLab)', 'Cloud (AWS, Azure or GCP)', 'Networking and security basics', 'Nginx']::text[], ARRAY['Kubernetes', 'PostgreSQL operations and backups', 'Monitoring and alerting', 'Microsoft 365 administration and IT support']::text[], ARRAY['English']::text[], 3, 5, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Keep our platforms and office systems running: deployments, servers, networks and the tools our teams use every day.

Responsibilities
- Build and run CI/CD pipelines and deployments
- Manage Linux servers, containers and reverse proxies
- Run backups, monitoring and security updates
- Support office IT: accounts, devices and networks
- Document systems and procedures

Requirements
- 3+ years in DevOps or IT engineering
- Linux, Docker, Nginx
- GitLab CI/CD or similar
- A major cloud provider
- Networking and security fundamentals

Nice to have
- Kubernetes, PostgreSQL administration
- Microsoft 365 administration$jd$),
  ('UI/UX Designer', 'Product & Technology', 'Mid', ARRAY['3+ years UI/UX design shipping web applications', 'Portfolio showing end-to-end work', 'Figma (components, variants, auto-layout, prototyping)', 'Complex, data-heavy applications (dashboards, SaaS)', 'Accessibility (WCAG) and mobile-first design', 'Design systems', 'SaaS (1+ year)', 'React.js (1+ year)']::text[], ARRAY['Education, e-learning or products for children', 'Arabic and right-to-left interfaces', 'Design-to-development handoff']::text[], ARRAY['English']::text[], 3, 5, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Design the experience of our e-learning products, used every day by schools, teachers, students and parents. You join at the start of the design phase and stay close to engineering as it is built.

Responsibilities
- Run the full design cycle: research, definition, ideation and high-fidelity design
- Analyse leading e-learning products and build personas for teachers, students, parents and administrators
- Map user journeys and produce information architecture, wireframes and prototypes
- Build a design system and component library engineers can implement directly
- Design age-appropriate experiences in English and Arabic, including full right-to-left layouts
- Build in accessibility to WCAG 2.2 AA
- Present and agree design direction in weekly reviews

Requirements
- 3+ years of UI/UX design shipping real web applications
- A portfolio with research, wireframes and polished UI
- Expert Figma
- Experience with dashboards, admin tools or SaaS
- WCAG, responsive and mobile-first design
- Design system experience

Nice to have
- Education or children's products
- Arabic / RTL interfaces
- Working knowledge of React$jd$),
  ('Graphic Designer', 'Design & Multimedia', 'Mid', ARRAY['Adobe InDesign', 'Adobe Illustrator and Photoshop', 'Book and textbook layout', 'Typography', 'Print-ready files']::text[], ARRAY['Arabic typesetting and right-to-left layout', 'Educational publishing', 'Interactive PDF or EPUB']::text[], ARRAY['English']::text[], 2, 5, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Lay out and design our textbooks, workbooks and teaching materials so they are clear, consistent and ready for print and digital.

Responsibilities
- Lay out books and series to the agreed design and style
- Design covers, page templates and visual elements
- Work with editors on corrections and proofs
- Prepare print-ready and digital files
- Keep series designs consistent

Requirements
- 2+ years in graphic design or book layout
- Strong InDesign, Illustrator and Photoshop
- Strong typography and attention to detail
- A portfolio

Nice to have
- Arabic typesetting
- Educational publishing
- Interactive PDF or EPUB$jd$),
  ('Illustrator', 'Design & Multimedia', 'Mid', ARRAY['Portfolio of children''s or educational illustration', 'Digital illustration (Procreate, Photoshop or Illustrator)', 'Consistent characters and style across a series', 'Working to briefs and deadlines']::text[], ARRAY['Vector illustration', 'Culturally appropriate illustration for MENA and African markets', 'Animation basics']::text[], ARRAY['English']::text[], 2, 5, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Create illustrations for our textbooks and digital learning content that help children understand and enjoy what they learn.

Responsibilities
- Illustrate to editorial briefs for books and digital content
- Develop characters and keep them consistent across a series
- Work with editors and designers on revisions
- Deliver files in the formats layout and multimedia need

Requirements
- A portfolio of children's or educational illustration
- Strong digital illustration skills
- Reliable on briefs and deadlines

Nice to have
- Vector illustration
- Culturally appropriate depictions for our markets$jd$),
  ('Multimedia / Motion Designer', 'Design & Multimedia', 'Mid', ARRAY['Adobe After Effects', '2D animation', 'Video editing (Premiere Pro)', 'Illustrator and Photoshop', 'Portfolio']::text[], ARRAY['Educational or explainer content', 'Digital learning objects (H5P or Articulate)', 'Arabic subtitling', '3D basics']::text[], ARRAY['English']::text[], 2, 5, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Create animations, videos and interactive learning objects for our e-learning products.

Responsibilities
- Animate educational explainers and interactive content
- Edit video and audio
- Prepare assets for e-learning platforms
- Work with editors and instructional designers on scripts and storyboards

Requirements
- 2+ years in motion design or multimedia
- After Effects, Premiere Pro, Illustrator and Photoshop
- A portfolio of animation work

Nice to have
- Digital learning objects (H5P, Articulate)
- Arabic subtitles
- 3D$jd$),
  ('ELT Editor', 'Editorial', 'Mid', ARRAY['Editing English Language Teaching (ELT) materials', 'Proofreading', 'Native or near-native English', 'CEFR levels', 'Working with authors']::text[], ARRAY['CELTA, DELTA or TESOL', 'English teaching experience', 'Digital ELT content', 'Arabic']::text[], ARRAY['English']::text[], 2, 5, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Edit English Language Teaching courses for schools across our markets, from manuscript to print and digital.

Responsibilities
- Edit and proofread ELT manuscripts for accuracy, level and consistency
- Check content against CEFR levels and curriculum requirements
- Work with authors, designers and illustrators
- Manage proofs and schedules
- Prepare content for digital products

Requirements
- 2+ years editing ELT or educational content
- Native or near-native English
- Knowledge of CEFR
- Strong attention to detail
- Microsoft Office

Nice to have
- CELTA, DELTA or TESOL
- Classroom teaching experience
- Arabic$jd$),
  ('ELT Commissioning Editor', 'Editorial', 'Senior', ARRAY['Commissioning ELT courses', 'Author management', 'Curriculum and market knowledge', 'Project and budget management', 'CEFR levels']::text[], ARRAY['Ministry of Education projects', 'Digital ELT products', 'Arabic or French']::text[], ARRAY['English']::text[], 5, 10, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Plan and commission English Language Teaching courses that meet the needs of schools and Ministries of Education in our markets.

Responsibilities
- Identify market and curriculum needs and propose new courses
- Recruit, brief and manage authors
- Own schedules and budgets from proposal to publication
- Guide editors, designers and digital teams
- Support sales and ministry projects

Requirements
- 5+ years in ELT publishing, with commissioning experience
- Strong curriculum and CEFR knowledge
- Author and project management
- Native or near-native English

Nice to have
- Ministry projects
- Digital ELT
- Arabic or French$jd$),
  ('Maths Editor', 'Editorial', 'Mid', ARRAY['Degree in Mathematics or related', 'Editing and proofreading', 'Checking mathematical accuracy', 'Curriculum alignment', 'Microsoft Office']::text[], ARRAY['MathType or LaTeX', 'Physics', 'Teaching experience', 'Arabic']::text[], ARRAY['English']::text[], 2, 5, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Review, edit and develop mathematics textbooks, assessments and digital content for students and teachers.

Responsibilities
- Edit and proofread maths content for accuracy, clarity and consistency
- Check every answer, worked example and diagram
- Align content with curriculum requirements and learning objectives
- Work with authors, designers and digital teams

Requirements
- Degree in Mathematics or a related field
- 2+ years in editing, content development or teaching
- Strong attention to detail
- Microsoft Office

Nice to have
- MathType or LaTeX
- Physics
- Arabic$jd$),
  ('Science Editor', 'Editorial', 'Mid', ARRAY['Degree in Biology, Chemistry, Physics or related', 'Editing and proofreading', 'Scientific fact-checking', 'Curriculum alignment', 'Microsoft Office']::text[], ARRAY['Teaching experience', 'Practical and lab safety content', 'Arabic']::text[], ARRAY['English']::text[], 2, 5, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Review, edit and develop science textbooks, assessments and digital content for students and teachers.

Responsibilities
- Edit and proofread science content for accuracy, clarity and consistency
- Verify scientific facts, diagrams and practical activities
- Align content with curriculum requirements and learning objectives
- Work with authors, illustrators and digital teams

Requirements
- Degree in a science subject
- 2+ years in editing, content development or teaching
- Strong research and attention to detail
- Microsoft Office

Nice to have
- Teaching experience
- Arabic$jd$),
  ('Social Science Editor', 'Editorial', 'Mid', ARRAY['Bachelor''s in Political Science or related (History, Geography, Economics, Sociology, IR)', 'Editing and proofreading', 'Educational content development', 'Research and fact-checking', 'Curriculum alignment', 'Microsoft Office']::text[], ARRAY['Psychology', 'Reviewing curriculum-based content', 'Arabic']::text[], ARRAY['English']::text[], 2, 5, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Review, edit and develop social science learning materials, assessments, textbooks and digital content, keeping them accurate, clear, neutral and age-appropriate.

Responsibilities
- Edit and proofread content for grammar, accuracy, clarity and editorial standards
- Verify historical, political, economic, geographical and social information
- Develop and improve materials, assessments and lesson plans
- Align content with curriculum requirements and learning objectives
- Review content for neutrality, cultural sensitivity and age appropriateness
- Work with curriculum developers, educators, writers and subject experts

Requirements
- Bachelor's degree in Political Science or a related field
- Knowledge of several of: geography, history, economics, sociology, civic education
- 2+ years in editing, content development, educational publishing, curriculum design, research or teaching
- Strong editing, research and analytical skills
- Microsoft Office and digital content tools

Nice to have
- Psychology
- Reviewing academic or curriculum-based content$jd$),
  ('Arabic Editor', 'Editorial', 'Mid', ARRAY['Native Arabic', 'Arabic grammar and proofreading', 'Editing educational content', 'Microsoft Office and Arabic typing']::text[], ARRAY['English to Arabic translation', 'Teaching Arabic', 'Arabic typesetting']::text[], ARRAY['Arabic', 'English']::text[], 2, 5, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Edit and proofread our Arabic textbooks and digital content so they are accurate, consistent and right for each age group.

Responsibilities
- Edit and proofread Arabic content for language, accuracy and consistency
- Review translated content against the English source
- Align content with curriculum requirements
- Work with authors, translators and designers

Requirements
- Native Arabic with excellent grammar
- 2+ years editing Arabic content
- Good English
- Microsoft Office

Nice to have
- Translation
- Teaching Arabic$jd$),
  ('English–Arabic Translator', 'Editorial', 'Mid', ARRAY['English to Arabic translation', 'Native Arabic with excellent English', 'Educational and technical terminology', 'CAT tools (Trados or memoQ)']::text[], ARRAY['Degree in translation', 'Localising e-learning content', 'Subtitling']::text[], ARRAY['Arabic', 'English']::text[], 2, 5, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Translate textbooks, assessments and digital learning content between English and Arabic.

Responsibilities
- Translate educational content accurately and naturally
- Keep terminology consistent across series
- Review translations and work with Arabic editors
- Localise interface text and e-learning content

Requirements
- Native Arabic with excellent English
- 2+ years translating
- CAT tools
- Strong attention to detail

Nice to have
- Translation degree
- E-learning localisation$jd$),
  ('Assessment Specialist / Item Writer', 'Assessment', 'Mid', ARRAY['Writing exam questions (items)', 'Mark schemes', 'Subject expertise', 'Assessment principles (validity, reliability)', 'Reviewing and editing items']::text[], ARRAY['Psychometrics or item response theory', 'Examiner experience', 'E-marking systems', 'Arabic']::text[], ARRAY['English']::text[], 2, 5, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Write, review and improve exam questions and mark schemes for national and school assessments.

Responsibilities
- Write items and mark schemes to specification
- Review and edit items from other writers
- Check items for accuracy, fairness and level
- Support marking, moderation and item analysis

Requirements
- 2+ years writing or reviewing assessments
- Strong subject knowledge
- Understanding of validity, reliability and fairness
- Strong written English

Nice to have
- Psychometrics
- Examiner or moderator experience
- Arabic$jd$),
  ('Marketing Specialist', 'Marketing', 'Mid', ARRAY['Bachelor''s in Marketing, Communications or related', 'Digital marketing, content strategy or social media growth', 'Social media platforms and algorithms', 'Content strategy and growth marketing', 'Data analysis and performance optimisation', 'Digital Marketing (2+ years)', 'Marketing (2+ years)']::text[], ARRAY['Working with creators or agencies', 'Design skills', 'Public speaking']::text[], ARRAY['English']::text[], 2, 3, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Own and grow our organic content across digital platforms, from ideas and briefs to publishing and performance.

Responsibilities
- Develop and run a scalable organic growth strategy across platforms
- Lead content ideation and write clear briefs with hooks, narratives and calls to action
- Work with creators and manage content production workflows
- Keep content quality high: storytelling, pacing and visuals
- Track reach, engagement, retention and conversions and scale what works
- Align organic and paid efforts

Requirements
- Bachelor's degree in Marketing, Communications or a related field
- 2–3 years in digital marketing, content strategy or social media growth
- A track record of scaling content with measurable results
- Strong understanding of social platforms and trends

Nice to have
- Experience with creators or agencies
- Design skills
- Confident presenter$jd$),
  ('Sales Representative', 'Sales', 'Junior', ARRAY['Education or B2B sales', 'Visiting schools and distributors', 'Presentation skills', 'CRM and sales reporting', 'Willingness to travel']::text[], ARRAY['Arabic or French for the market', 'Teaching background', 'Driving licence']::text[], ARRAY['English']::text[], 1, 3, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Present York Press and Pearson resources to schools and distributors in your territory and grow adoptions.

Responsibilities
- Visit schools and present our books and digital products
- Build relationships with teachers, coordinators and distributors
- Follow up quotes, orders and samples
- Keep the CRM up to date and report on the territory

Requirements
- 1+ years in sales, ideally education
- Confident presenter and communicator
- Organised with CRM and reporting
- Able to travel

Nice to have
- Teaching background
- Local language$jd$),
  ('Regional Sales Manager / Country Manager', 'Sales', 'Manager', ARRAY['Education publishing sales', 'Managing a region or country and its targets', 'Ministry and distributor relationships', 'Team leadership', 'Tenders']::text[], ARRAY['Arabic or French', 'Assessment services', 'Pearson products']::text[], ARRAY['English']::text[], 6, 10, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Lead our business in a country or region: sales, ministry and distributor relationships, and the local team.

Responsibilities
- Set and deliver the sales plan for the region
- Manage relationships with ministries, schools and distributors
- Lead tenders and large projects
- Lead and develop the local sales team
- Report results and market insight to leadership

Requirements
- 6+ years in education sales, with management experience
- A track record with ministries or large accounts
- Team leadership
- Willing to travel

Nice to have
- Arabic or French
- Assessment services$jd$),
  ('Business Development / Key Account Manager', 'Sales', 'Senior', ARRAY['Business development in education', 'Key accounts (ministries, school networks)', 'Proposals and tenders', 'Negotiation', 'CRM']::text[], ARRAY['Government relations', 'Assessment services', 'Arabic']::text[], ARRAY['English']::text[], 5, 8, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Win and grow large accounts such as ministries of education and school networks, and open new markets.

Responsibilities
- Find and qualify new opportunities and markets
- Manage key accounts and their renewals
- Prepare proposals and tender responses
- Negotiate terms and work with operations on delivery

Requirements
- 5+ years in business development or key accounts, ideally education
- Proposal and tender experience
- Strong negotiation

Nice to have
- Government relations
- Arabic$jd$),
  ('Accountant', 'Finance', 'Entry', ARRAY['Bachelor''s in Accounting or Finance', 'Accounting principles and bookkeeping', 'Microsoft Excel and Office', 'Accounting (1+ year)', 'Microsoft Office suite (4+ years)']::text[], ARRAY['Internship experience', 'Accounting software or ERP']::text[], ARRAY['English']::text[], 0, 1, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Support daily accounting operations and gain hands-on experience across the full accounting cycle. A great start for a recent Accounting or Finance graduate.

Responsibilities
- Record daily transactions and keep accurate records
- Prepare journal entries and maintain the general ledger
- Support accounts payable and receivable
- Process invoices, receipts and payment vouchers
- Perform bank, customer and supplier reconciliations
- Support month-end and year-end closing
- Prepare documents for tax and statutory reporting

Requirements
- Bachelor's degree in Accounting, Finance or a related field
- Fresh graduate; internship experience is an advantage
- Basic accounting principles and bookkeeping
- Good Excel and Microsoft Office
- Integrity with confidential information

Nice to have
- Accounting software or ERP$jd$),
  ('Financial Accountant', 'Finance', 'Senior', ARRAY['Full accounting cycle', 'Month-end and year-end closing', 'Financial statements (IFRS)', 'Reconciliations', 'Excel and ERP']::text[], ARRAY['CPA, ACCA or ACA', 'Multi-entity, multi-currency accounting', 'Tax']::text[], ARRAY['English']::text[], 4, 8, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Own the accounts for one or more York Press entities, from the ledger to financial statements.

Responsibilities
- Run month-end and year-end closing
- Prepare financial statements and management reports
- Review reconciliations and journal entries
- Work with auditors and tax advisers
- Guide junior accountants

Requirements
- 4+ years in accounting
- Strong IFRS knowledge
- Advanced Excel and ERP

Nice to have
- CPA, ACCA or ACA
- Multi-currency groups$jd$),
  ('Internal Auditor', 'Finance', 'Mid', ARRAY['Internal audit', 'Internal controls and risk', 'Audit reporting', 'Accounting knowledge', 'Excel']::text[], ARRAY['CIA certification', 'ERP audits', 'Multi-country operations']::text[], ARRAY['English']::text[], 3, 6, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Review our processes and controls across offices and help the business fix what matters.

Responsibilities
- Plan and carry out internal audits
- Test controls and identify risks
- Write clear findings and follow up actions
- Support external audits

Requirements
- 3+ years in internal or external audit
- Strong accounting and controls knowledge
- Clear report writing

Nice to have
- CIA
- Multi-country groups$jd$),
  ('Office Manager', 'Operations', 'Manager', ARRAY['Office administration', 'Vendors and facilities', 'Team coordination', 'Microsoft Office', 'Budget tracking']::text[], ARRAY['HR administration', 'Import and logistics', 'Arabic']::text[], ARRAY['English']::text[], 5, 8, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Run the office so teams can focus on their work: facilities, suppliers, administration and day-to-day operations.

Responsibilities
- Manage facilities, suppliers and office budgets
- Coordinate administration and support staff
- Organise purchasing, travel and events
- Keep records, policies and procedures up to date

Requirements
- 5+ years in office or operations management
- Strong organisation and communication
- Microsoft Office

Nice to have
- HR administration
- Logistics
- Arabic$jd$),
  ('Executive Assistant', 'Operations', 'Mid', ARRAY['Calendar and travel management', 'Executive communication and minutes', 'Confidentiality', 'Microsoft Office', 'Excellent written English']::text[], ARRAY['Arabic', 'Supporting board or ministry meetings']::text[], ARRAY['English']::text[], 3, 6, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Support senior leadership with their diary, travel, meetings and communications.

Responsibilities
- Manage calendars, travel and meetings
- Prepare documents, minutes and follow-ups
- Handle confidential information with discretion
- Coordinate with teams and external partners

Requirements
- 3+ years as an executive or personal assistant
- Excellent written English
- Highly organised and discreet
- Microsoft Office

Nice to have
- Arabic$jd$),
  ('Procurement Officer', 'Operations', 'Mid', ARRAY['Purchasing and supplier management', 'Negotiation', 'Purchase orders and records', 'Excel or ERP']::text[], ARRAY['Print and paper procurement', 'Import, export and logistics', 'Arabic']::text[], ARRAY['English']::text[], 2, 5, $jd$About York Press
York Press is an educational publishing company within the Sayegh Group, serving schools and Ministries of Education across the Middle East, Africa and beyond, with a long-standing partnership with Pearson. We publish textbooks and assessments and are building a new generation of e-learning platforms for schools, teachers, students and parents.

The Role
Buy the goods and services the business needs, including printing, at the right price, quality and time.

Responsibilities
- Source and compare suppliers
- Negotiate prices and terms
- Raise and track purchase orders
- Keep supplier records up to date
- Coordinate deliveries with logistics

Requirements
- 2+ years in procurement or purchasing
- Negotiation
- Excel or ERP

Nice to have
- Printing industry
- Import and export$jd$)
ON CONFLICT (lower("title")) DO NOTHING;
--> statement-breakpoint
INSERT INTO "locations" ("name", "country", "city", "work_arrangement", "working_hours") VALUES
  ('Zouk Mosbeh, Lebanon', 'Lebanon', 'Zouk Mosbeh', 'On-site', 'Mon–Fri 8:00–17:00 (1-hour lunch), Sat 8:00–13:30'),
  ('London, United Kingdom', 'United Kingdom', 'London', 'On-site', 'Mon–Fri 8:00–17:00 (1-hour lunch), Sat 8:00–13:30'),
  ('Nigeria', 'Nigeria', NULL, 'On-site', 'Mon–Fri 8:00–17:00 (1-hour lunch), Sat 8:00–13:30'),
  ('Athens, Greece', 'Greece', 'Athens', 'On-site', 'Mon–Fri 8:00–17:00 (1-hour lunch), Sat 8:00–13:30'),
  ('Dubai, United Arab Emirates', 'United Arab Emirates', 'Dubai', 'On-site', 'Mon–Fri 8:00–17:00 (1-hour lunch), Sat 8:00–13:30'),
  ('Saudi Arabia', 'Saudi Arabia', NULL, 'On-site', 'Mon–Fri 8:00–17:00 (1-hour lunch), Sat 8:00–13:30'),
  ('Alexandria, Egypt', 'Egypt', 'Alexandria', 'On-site', 'Mon–Fri 8:00–17:00 (1-hour lunch), Sat 8:00–13:30'),
  ('Cairo, Egypt', 'Egypt', 'Cairo', 'On-site', 'Mon–Fri 8:00–17:00 (1-hour lunch), Sat 8:00–13:30'),
  ('Morocco', 'Morocco', NULL, 'On-site', 'Mon–Fri 8:00–17:00 (1-hour lunch), Sat 8:00–13:30'),
  ('Jordan', 'Jordan', NULL, 'On-site', 'Mon–Fri 8:00–17:00 (1-hour lunch), Sat 8:00–13:30'),
  ('Syria', 'Syria', NULL, 'On-site', 'Mon–Fri 8:00–17:00 (1-hour lunch), Sat 8:00–13:30')
ON CONFLICT (lower("name")) DO NOTHING;
