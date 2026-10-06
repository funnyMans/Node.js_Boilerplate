# Trucking work-platform discussion

These documents capture a **reference operating model** for discussing how a
small US trucking company might coordinate work. They are not a product
roadmap, implementation specification, or claim that the repository is
becoming a full TMS. Keep the distinction clear:

- The project is a reusable Node.js backend foundation.
- The trucking model is a realistic example for exploring business
  boundaries, handoffs, and failure containment.
- A future product should implement only the smallest complete workflow
  justified by actual users and requirements.

1. [Vision and boundaries](./VISION.md): what the platform is for and what
   this discussion deliberately excludes.
2. [Actors and authority](./RESPONSIBILITIES.md): who does the work, who may
   decide, and how reporting differs from load accountability.
3. [Load workflow](./WORKFLOW.md): sourcing priority, assignment, regional
   differences, and handoffs.
4. [Questions for later](./OPEN_QUESTIONS.md): the few answers needed before
   implementing a real end-to-end workflow, plus details that can wait.

These are working hypotheses for a small US trucking company with its own
fleet and brokerage. They are not universal industry practice or legal
advice. Validate them with operators, customers, carriers, and qualified
professionals before using them to run a real business.
