-- Starter list of positions York Press hires for often (approved by Abed). Runs once; after that the list
-- is kept in Settings → Positions. ON CONFLICT keeps any position that was already added by hand.
INSERT INTO "positions" ("title", "department", "seniority", "must_haves", "nice_to_haves", "languages", "min_years", "ideal_years") VALUES
  ('Junior Editor', 'Editorial', 'Junior', ARRAY['Editing', 'Proofreading', 'Strong written English'], ARRAY['Arabic'], ARRAY['English'], 0, 2),
  ('Editor', 'Editorial', 'Mid', ARRAY['Textbook editing', 'Proofreading', 'Working with authors'], ARRAY['Arabic'], ARRAY['English'], 3, 5),
  ('Senior Editor', 'Editorial', 'Senior', ARRAY['Educational publishing', 'Managing a series', 'Author management'], ARRAY['Arabic'], ARRAY['English'], 6, 8),
  ('Commissioning Editor', 'Editorial', 'Senior', ARRAY['Commissioning', 'Curriculum knowledge', 'Author management'], ARRAY['Arabic'], ARRAY['English'], 6, 10),
  ('Copy Editor / Proofreader', 'Editorial', 'Mid', ARRAY['Copy editing', 'Proofreading', 'Style guides'], ARRAY['Arabic'], ARRAY['English'], 2, 5),
  ('Subject Specialist Editor (Maths / Science / English)', 'Editorial', 'Mid', ARRAY['Subject degree', 'Textbook editing', 'Curriculum knowledge'], ARRAY['Arabic'], ARRAY['English'], 3, 6),
  ('Assessment Writer', 'Assessment', 'Mid', ARRAY['Writing exam questions', 'Mark schemes', 'Subject knowledge'], ARRAY[]::text[], ARRAY['English'], 2, 5),
  ('Instructional / Learning Designer', 'Product & Technology', 'Mid', ARRAY['Learning design', 'Digital content', 'Curriculum mapping'], ARRAY[]::text[], ARRAY['English'], 3, 5),
  ('Digital Product Manager (York-E)', 'Product & Technology', 'Senior', ARRAY['Product management', 'EdTech', 'Working with developers'], ARRAY[]::text[], ARRAY['English'], 5, 8),
  ('Frontend Developer (React)', 'Product & Technology', 'Mid', ARRAY['React', 'TypeScript', 'Responsive web'], ARRAY[]::text[], ARRAY['English'], 3, 5),
  ('Graphic Designer (Educational)', 'Product & Technology', 'Mid', ARRAY['Adobe InDesign', 'Illustrator', 'Book layout'], ARRAY[]::text[], ARRAY['English'], 2, 5),
  ('Production Coordinator', 'Operations', 'Mid', ARRAY['Print production', 'Scheduling', 'Supplier management'], ARRAY[]::text[], ARRAY['English'], 2, 5),
  ('Rights & Permissions Coordinator', 'Operations', 'Junior', ARRAY['Copyright clearance', 'Image licensing', 'Record keeping'], ARRAY[]::text[], ARRAY['English'], 1, 3),
  ('Regional Sales Manager (Education)', 'Sales', 'Senior', ARRAY['Education sales', 'Distributor management', 'Travel'], ARRAY['Arabic'], ARRAY['English'], 5, 8),
  ('Education Consultant / Teacher Trainer', 'Sales', 'Mid', ARRAY['Teaching experience', 'Presenting', 'School relationships'], ARRAY['Arabic'], ARRAY['English'], 3, 6),
  ('Marketing Executive', 'Marketing', 'Junior', ARRAY['Digital marketing', 'Content writing', 'Social media'], ARRAY[]::text[], ARRAY['English'], 1, 3),
  ('Accountant', 'Finance', 'Mid', ARRAY['Accounting', 'Reconciliations', 'Excel'], ARRAY[]::text[], ARRAY['English'], 3, 5),
  ('HR Officer', 'HR', 'Mid', ARRAY['Recruitment', 'HR administration', 'Employment law basics'], ARRAY[]::text[], ARRAY['English'], 2, 5)
ON CONFLICT (lower("title")) DO NOTHING;
