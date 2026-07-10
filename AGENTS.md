# Project Instructions

## Documentation Workflow

Use the project skill at `skills/gen-docs/SKILL.md` for architecture and development documentation.

Before implementing any new feature, generate or update the relevant principle/architecture document from the discussion, requirements, and implementation plan.

After every modification, refinement, or debug fix, update the corresponding documentation based on the actual code changes.

Documentation output paths:

- Principle and architecture docs: `docs/architecture/{module}/README.md`
- Development implementation docs: `docs/dev/{module}/README.md` or `docs/dev/{module}/{topic}.md`

Keep the responsibilities separate:

- `docs/architecture` explains why the design exists and how the system works.
- `docs/dev` records how the feature is developed, changed, debugged, and delivered.
