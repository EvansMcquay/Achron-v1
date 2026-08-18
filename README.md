Yes. Based on what you've actually shown me about **Achron + Base44 + GitHub + the degree engine + school/program discovery/import work**, I'd use this as the accurate README rather than the earlier version that assumed a Supabase architecture.

# Achron

### Academic Degree Auditing & Planning

**Achron is an academic planning platform designed to help students understand their degree progress, identify remaining requirements, and build toward graduation using structured university, program, course, and academic-record data.**

**Website:** [https://achron.com](https://achron.com)
**Documentation:** Coming soon
**Demo:** Coming soon

---

## Introduction

Understanding what is required to graduate can be difficult.

Academic information is often spread across university catalogs, degree audits, program requirements, course descriptions, prerequisite rules, and a student's individual academic record.

Achron is designed to bring these pieces together into a structured academic system.

The platform models:

* Universities
* Academic programs
* Courses
* Degree requirements
* Course prerequisites
* Student academic records
* Grades
* Course status
* Program and catalog data

Achron then uses this structured information to evaluate academic progress and determine which requirements have been satisfied and which remain.

The goal is to move beyond a static degree checklist toward a system that can **understand and reason about academic progress**.

---

## Core Features

### Degree Auditing

Evaluate a student's academic record against the requirements of their selected program.

The degree engine accounts for:

* Completed courses
* Grades
* Passing-grade requirements
* Course credits
* In-progress courses
* Withdrawn courses
* Requirement matching
* Requirement thresholds
* Repeated courses
* Resolved courses
* Provisional course records

### Academic Records

Students can maintain an academic record containing courses and their associated academic information.

Academic records are designed to support:

* Course
* Grade
* Credits
* Term
* Academic status
* Catalog resolution
* Academic source information

### Program & Requirement Modeling

Achron represents degree programs as structured requirements rather than static text.

```text
University
    ↓
Program
    ↓
Requirements
    ↓
Courses
```

This allows programs to define different combinations of:

* Required courses
* Major requirements
* Electives
* Supporting requirements
* General education requirements
* Credit requirements

### Course Prerequisites

Courses can be connected through prerequisite relationships.

```text
Course A
   ↓
Prerequisite
   ↓
Course B
```

This provides the foundation for future academic planning and course scheduling.

### Course Resolution

Achron can distinguish between a student course record and the corresponding university catalog course.

```text
Student Record
      ↓
Course Resolution
      ↓
University Catalog Course
      ↓
Resolved Academic Record
```

This helps ensure that authoritative catalog information is used when evaluating degree progress.

### Repeat Detection

Achron includes logic for identifying repeated courses so that duplicate academic records do not incorrectly affect degree calculations.

### Data Import & Discovery

Achron includes a data pipeline for discovering and importing university and program information from external academic data sources.

The system is designed to:

```text
Discover
   ↓
Import
   ↓
Validate
   ↓
Normalize
   ↓
Resolve
   ↓
Store
   ↓
Use in Degree Engine
```

---

# Degree Engine

The degree engine is the core rules-based component of Achron.

It evaluates a student's academic record against the requirements of a selected program.

At a high level:

```text
Student Academic Record
          +
Program Requirements
          +
Course Catalog
          ↓
     Degree Engine
          ↓
      Degree Audit
```

The engine determines whether academic records can satisfy requirements while accounting for course status, grades, credits, and catalog information.

## Academic Evaluation

Achron distinguishes between academic states such as:

```text
Completed
In Progress
Withdrawn
Provisional
Resolved
```

A completed course must satisfy the applicable passing-grade rules before being treated as completed academic credit.

Catalog course information is used as the authoritative source for course credits when a student course has been successfully resolved to the catalog.

---

# Data Integrity

Academic data can be incomplete, inconsistent, or ambiguous.

For example, a student record may contain a course that cannot immediately be matched to a university catalog course.

Achron therefore uses the concept of **resolved** and **provisional** records.

## Resolved

A course has been confidently matched to an authoritative catalog course.

Resolved information can be used for:

* Course identity
* Catalog credits
* Requirement matching
* Prerequisite relationships
* Degree calculations

## Provisional

A course exists in the academic record but has not yet been confidently matched to the university catalog.

Provisional information can be retained while preventing uncertain information from automatically becoming authoritative.

This allows Achron to preserve information without compromising degree calculations.

---

# Academic Data Model

Achron's academic model is built around relationships between institutions, programs, requirements, courses, and student records.

```text
University
    │
    └── Program
          │
          └── Requirement
                 │
                 └── RequirementCourse
                        │
                        └── Course
                              │
                              └── CoursePrerequisite


StudentProfile
    │
    └── StudentCourse
          │
          └── DegreeAudit
                 │
                 └── StudentDegreeRequirement
```

## Core Entities

| Entity                     | Purpose                                          |
| -------------------------- | ------------------------------------------------ |
| `University`               | Represents an institution                        |
| `Program`                  | Represents an academic program                   |
| `Course`                   | Represents a catalog course                      |
| `Requirement`              | Represents a degree requirement                  |
| `RequirementCourse`        | Connects courses to requirements                 |
| `CoursePrerequisite`       | Represents prerequisite relationships            |
| `StudentProfile`           | Represents a student's academic profile          |
| `StudentCourse`            | Represents a student's academic record           |
| `DegreeAudit`              | Represents a degree-progress evaluation          |
| `StudentDegreeRequirement` | Represents student-specific requirement progress |

---

# Program & Major Discovery

Achron is designed to support school-specific academic program discovery.

Rather than treating a major as a universal list, programs are associated with the institutions that offer them.

The intended selection flow is:

```text
School
   ↓
Degree
   ↓
Major / Program
   ↓
Catalog / Academic Year
```

Program records can include information such as:

* Canonical major
* CIP code
* CIP title
* Degree level
* University
* Verification status

The system also supports distinguishing verified program information from baseline or provisional program information.

---

# Catalog & External Data

Achron uses external academic datasets as part of its university and program discovery/import process.

The data pipeline is designed to account for differences between external data sources and Achron's internal academic model.

External data may require:

* Parsing
* Normalization
* Validation
* Mapping
* Course/program resolution
* Verification

External data is therefore not automatically treated as authoritative simply because it was successfully imported.

---

# Import Pipeline

The general import architecture is:

```text
External Source
      ↓
Discovery
      ↓
Fetch
      ↓
Parse
      ↓
Validate
      ↓
Normalize
      ↓
Resolve
      ↓
Verify
      ↓
Database
      ↓
Degree Engine
```

The pipeline is designed to make incomplete or unexpected source data visible rather than silently producing incorrect academic records.

---

# Student Onboarding

Achron is designed to support multiple ways of establishing a student's academic record.

The onboarding flow can use:

```text
Transcript / Degree Audit
          ↓
     Data Extraction
          ↓
    Missing Information
          ↓
    Student Confirmation
          ↓
    Academic Record
```

Students can also enter academic information manually when automated extraction cannot determine a required field.

Missing information is treated as information that still needs to be provided rather than automatically treating the record as invalid.

---

# Academic Planning

The degree engine provides the foundation for future academic-planning functionality.

The long-term system is designed to help answer questions such as:

> What do I still need to graduate?

> Which courses satisfy my remaining requirements?

> What courses can I take next?

> Which prerequisites are blocking me?

> How can I plan my remaining semesters?

> What courses could affect my expected graduation date?

Academic planning will build on the same program, course, prerequisite, and student-record data used by the degree engine.

---

# Architecture

Achron is currently developed as a web application using **Base44** with source control through **GitHub**.

```text
Developer
    │
    ↓
Local Git Repository
    │
    ↓
GitHub
    │
    ↓
Base44
    │
    ├── Application
    ├── Backend
    └── Builder
```

The repository provides version-controlled application source code, while Base44 provides the connected application development and deployment environment.

---

# Technology

## Application

* React
* JavaScript
* Vite
* Tailwind CSS

## Platform

* Base44
* Base44 CLI

## Development

* Git
* GitHub
* npm

Additional technologies may be added as the platform evolves.

---

# Local Development

## Prerequisites

* Node.js
* npm
* Git
* Access to the Achron Base44 project

Install dependencies:

```bash
npm install
```

Install the Base44 CLI:

```bash
npm install -g base44@latest
```

---

## Run the Full Development Environment

From the project root:

```bash
base44 dev
```

When configured, this starts the local Base44 development backend and the frontend development server.

The local frontend URL will be displayed by the command.

---

## Run the Frontend Only

To run the frontend against the hosted Base44 backend:

```bash
npm run dev
```

Vite will display the local development URL.

---

## Environment Variables

Frontend-only development may require a `.env.local` file.

Example:

```env
VITE_BASE44_APP_ID=your_app_id
VITE_BASE44_APP_BASE_URL=https://your-app.base44.app
```

Do not commit `.env.local` or real credentials to the repository.

Use `.env.example` to document required environment variables without exposing secrets.

---

# Git & Base44 Workflow

Achron uses GitHub for source control and Base44 for application development and publishing.

Typical workflow:

```bash
git pull
```

Make changes locally.

Then:

```bash
git add .
git commit -m "Describe the change"
git push
```

Changes pushed to the connected repository can be reflected in the Base44 Builder.

To open the Base44 dashboard:

```bash
base44 dashboard open
```

Changes can then be reviewed and published through Base44.

---

# Testing & Quality Assurance

Achron's degree engine is designed around academic edge cases where incorrect logic could produce incorrect graduation results.

Testing includes scenarios such as:

* Completed courses
* Passing grades
* Failing grades
* In-progress courses
* Withdrawn courses
* Unrelated courses
* Grade gates
* Repeated courses
* Requirement satisfaction
* Credit calculations
* Resolved courses
* Provisional courses
* Duplicate academic records
* Student record ownership

The project also uses QA to verify data imports and application behavior as new university and program data is introduced.

---

# Project Structure

The repository currently contains the application's configuration, source code, components, and supporting files.

```text
achron/
│
├── .gitignore
├── AGENTS.md
├── CLAUDE.md
├── components.json
├── eslint.config.js
├── index.html
├── jsconfig.json
├── package.json
├── postcss.config.js
├── README.md
├── tailwind.config.js
├── vite.config.js
│
├── src/
├── components/
├── public/
├── docs/
└── ...
```

The exact application structure may evolve as Achron's architecture develops.

---

# Project Status

**Active Development**

Achron is actively being developed.

Current development is focused on:

* Degree-audit reliability
* Academic data integrity
* University and program discovery
* Catalog data imports
* Course/program resolution
* Student academic records
* Program-specific major availability
* Academic planning foundations

Some advanced planning and automation features remain under development.

---

# Roadmap

## Academic Engine

* [x] University model
* [x] Program model
* [x] Course model
* [x] Requirement model
* [x] Course prerequisites
* [x] Student academic records
* [x] Degree-audit engine
* [x] Passing-grade evaluation
* [x] In-progress course handling
* [x] Withdrawn-course handling
* [x] Repeat detection
* [x] Resolved/provisional record architecture
* [x] Requirement evaluation

## University & Program Data

* [x] University discovery architecture
* [x] Program discovery architecture
* [x] CIP normalization
* [x] Program verification status
* [x] External academic data integration
* [ ] Expand verified university coverage
* [ ] Improve automatic program discovery
* [ ] Improve course/catalog resolution
* [ ] Increase program verification coverage

## Student Experience

* [x] Academic profile
* [x] Academic record management
* [x] Manual academic record entry
* [x] Academic record validation
* [ ] Expanded transcript extraction
* [ ] Improved degree-audit explanations
* [ ] Semester planning
* [ ] Graduation timeline planning

## Platform

* [ ] Public demo
* [ ] Production website
* [ ] Public documentation
* [ ] Expanded automated testing
* [ ] Continuous integration
* [ ] Broader university coverage

---

# Security & Privacy

Achron may process academic information that can be sensitive.

The application is designed to limit student academic-record operations to authorized users and to avoid committing secrets or private configuration to source control.

Never commit:

* API keys
* Authentication tokens
* Database credentials
* `.env.local`
* Production secrets
* Private student records
* Real transcript files containing personal information

Achron is currently under development and should not be considered an official replacement for a university's academic record or degree-audit system.

---

# Documentation

Detailed technical documentation will be maintained separately from the main README.

Planned documentation includes:

```text
docs/
├── development.md
├── architecture.md
├── degree-engine.md
├── data-model.md
├── academic-records.md
├── course-resolution.md
├── import-pipeline.md
├── requirements.md
├── testing.md
└── security.md
```

The README provides the high-level overview; the documentation provides deeper implementation details.

---

# Contributing

Achron is currently under active development.

Contribution guidelines will be established as the project moves toward a public development model.

For the current development process, use the repository's Git workflow and Base44 development environment.

---

# License

Achron is currently under active development.

A final open-source license will be added before the repository is publicly released.

---

# About

Achron is an independent software project focused on building better infrastructure for understanding university degree requirements and academic progress.

The project combines:

**Software Engineering + Data Systems + Academic Rules + Automated Evaluation**

with the goal of making degree planning more understandable, structured, and actionable.

