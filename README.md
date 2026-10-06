# Fordridge Junior & Senior School

A full-stack React and Supabase platform for Fordridge Schools in Harare, Zimbabwe.

## Highlights

- Public Junior and Senior School website with admissions, gallery, contact, and enquiry flows.
- Secure portal for administrators, teachers, parents, and learners.
- Attendance, bulk marks, announcements, finance, and formal report workflows.
- Released-report snapshots preserve issued marks, grades, rankings, signatories, and approvals.

## Run locally

```bash
npm install
npm run dev
```

Run `npm run build` for a production verification. Apply Supabase migrations from `supabase/migrations` before using portal workflows.

---

# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some Oxlint rules.

Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Oxc](https://oxc.rs)
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/)

## React Compiler

The React Compiler is not enabled on this template because of its impact on dev & build performances. To add it, see [this documentation](https://react.dev/learn/react-compiler/installation).

## Expanding the Oxlint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and Oxlint's TypeScript related rules in your project.
