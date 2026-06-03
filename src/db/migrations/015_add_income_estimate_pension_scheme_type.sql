ALTER TABLE income_estimates ADD COLUMN pension_scheme_type TEXT NOT NULL DEFAULT 'salary_sacrifice' CHECK (pension_scheme_type IN ('salary_sacrifice', 'defined_contribution', 'defined_benefit'));
