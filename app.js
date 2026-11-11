
(() => {
  const $ = (id) => document.getElementById(id);

  let db;

  function message(id, text) {
    const el = $(id);
    if (el) el.textContent = text;
  }

  function escapeHTML(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function getParam(name) {
    return new URLSearchParams(location.search).get(name);
  }

  function requireDatabase() {
    if (!window.supabase || !window.SUPABASE_URL ||
        !window.SUPABASE_ANON_KEY) {
      alert("Supabase is not configured yet. Please complete the setup.");
      return false;
    }

    if (!db) {
      db = window.supabase.createClient(
        window.SUPABASE_URL,
        window.SUPABASE_ANON_KEY
      );
    }

    return true;
  }

  async function getUser() {
    if (!requireDatabase()) return null;
    const { data, error } = await db.auth.getUser();
    if (error) return null;
    return data.user;
  }

  // LOGIN AND REGISTRATION
  const loginForm = $("login-form");
  const registerForm = $("register-form");

  $("show-login")?.addEventListener("click", () => {
    if (loginForm) loginForm.hidden = false;
    if (registerForm) registerForm.hidden = true;
    $("show-login").setAttribute("aria-pressed", "true");
    $("show-register")?.setAttribute("aria-pressed", "false");
  });

  $("show-register")?.addEventListener("click", () => {
    if (loginForm) loginForm.hidden = true;
    if (registerForm) registerForm.hidden = false;
    $("show-register").setAttribute("aria-pressed", "true");
    $("show-login")?.setAttribute("aria-pressed", "false");
  });

  loginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireDatabase()) return;

    const email = $("login-email").value.trim();
    const password = $("login-password").value;

    message("auth-message", "Signing in...");

    const { error } = await db.auth.signInWithPassword({
      email,
      password
    });

    if (error) {
      message("auth-message", error.message);
      return;
    }

    location.href = "dashboard.html";
  });

  registerForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!requireDatabase()) return;

    const fullName = $("register-name").value.trim();
    const email = $("register-email").value.trim();
    const password = $("register-password").value;
    const role = $("register-role").value;

    if (password.length < 8) {
      message("auth-message", "Use a password of at least 8 characters.");
      return;
    }

    message("auth-message", "Creating your account...");

    const { data, error } = await db.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
          role
        }
      }
    });

    if (error) {
      message("auth-message", error.message);
      return;
    }

    if (data.session) {
      location.href = "dashboard.html";
    } else {
      message(
        "auth-message",
        "Account created. Check your email to confirm your account, then sign in."
      );
    }
  });

  // LOG OUT
  $("logout-button")?.addEventListener("click", async () => {
    if (!requireDatabase()) return;
    const { error } = await db.auth.signOut();
    if (error) {
      alert(error.message);
      return;
    }
    location.href = "index.html";
  });

  // JOB SEARCH AND LISTINGS
  async function loadJobs() {
    const container = $("jobs-list");
    if (!container || !requireDatabase()) return;

    container.textContent = "Loading jobs...";

    let query = db.from("jobs")
      .select("*")
      .eq("status", "approved")
      .order("created_at", { ascending: false });

    const search = $("job-search")?.value.trim();
    const category = $("job-category")?.value;

    if (search) {
      const safeSearch = search.replace(/[,%()]/g, " ").trim();
      if (safeSearch) {
        query = query.or(
          `title.ilike.%${safeSearch}%,company.ilike.%${safeSearch}%`
        );
      }
    }

    if (category) query = query.eq("category", category);

    const { data, error } = await query;

    if (error) {
      container.textContent = "Unable to load jobs: " + error.message;
      return;
    }

    if (!data.length) {
      container.textContent = "No approved jobs found yet.";
      return;
    }

    container.innerHTML = data.map(job => `
      <article class="feature-card">
        <p class="eyebrow">${escapeHTML(job.category)}</p>
        <h3>${escapeHTML(job.title)}</h3>
        <p>${escapeHTML(job.company)}</p>
        <p>${escapeHTML(job.location)} · ${escapeHTML(job.job_type)}</p>
        <p>${escapeHTML(job.salary || "Salary not specified")}</p>
        <a class="btn btn-primary"
           href="job.html?id=${encodeURIComponent(job.id)}">
           View Opportunity →
        </a>
      </article>
    `).join("");
  }

  $("search-jobs")?.addEventListener("click", loadJobs);
  $("job-search")?.addEventListener("keydown", event => {
    if (event.key === "Enter") loadJobs();
  });
  $("job-category")?.addEventListener("change", loadJobs);

  // JOB DETAILS
  async function loadJobDetails() {
    const container = $("job-details");
    if (!container || !requireDatabase()) return;

    const id = getParam("id");
    if (!id) {
      container.textContent = "No job was selected.";
      return;
    }

    const { data: job, error } = await db.from("jobs")
      .select("*")
      .eq("id", id)
      .eq("status", "approved")
      .maybeSingle();

    if (error || !job) {
      container.textContent = "This job could not be found.";
      return;
    }

    container.innerHTML = `
      <p class="eyebrow">${escapeHTML(job.category)}</p>
      <h1>${escapeHTML(job.title)}</h1>
      <h3>${escapeHTML(job.company)}</h3>
      <p>${escapeHTML(job.location)} · ${escapeHTML(job.job_type)}</p>
      <p>${escapeHTML(job.salary || "Salary not specified")}</p>
      <hr>
      <h3>Job description</h3>
      <p>${escapeHTML(job.description).replace(/\n/g, "<br>")}</p>
      <p>${escapeHTML(job.application_note || "")}</p>
      <a class="btn btn-primary"
         href="apply.html?id=${encodeURIComponent(job.id)}">
         Apply for this Job →
      </a>
    `;
  }

  // EMPLOYER JOB POSTING
  $("post-job-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!requireDatabase()) return;

    const user = await getUser();

    if (!user) {
      message("post-job-message", "Please sign in before posting a job.");
      return;
    }

    if (user.user_metadata?.role !== "employer") {
      message("post-job-message", "Please use an employer account to post vacancies.");
      return;
    }

    const job = {
      user_id: user.id,
      title: $("job-title").value.trim(),
      company: $("company-name").value.trim(),
      category: $("job-category").value,
      job_type: $("job-type").value,
      location: $("job-location").value.trim(),
      salary: $("job-salary").value.trim(),
      description: $("job-description").value.trim(),
      application_note: $("application-note").value.trim(),
      status: "pending"
    };

    message("post-job-message", "Submitting vacancy...");

    const { error } = await db.from("jobs").insert(job);

    if (error) {
      message("post-job-message", error.message);
      return;
    }

    $("post-job-form").reset();
    message("post-job-message", "Vacancy submitted for admin review.");
  });

  // APPLY FOR A JOB AND UPLOAD CV
  async function prepareApplication() {
    const field = $("application-job-id");
    if (field) field.value = getParam("id") || "";
  }

  $("application-form")?.addEventListener("submit", async event => {
    event.preventDefault();
    if (!requireDatabase()) return;

    const user = await getUser();

    if (!user) {
      message("application-message", "Please sign in before applying.");
      return;
    }

    if (user.user_metadata?.role !== "job_seeker") {
      message("application-message", "Please use a job seeker account to apply.");
      return;
    }

    const jobId = $("application-job-id").value;
    const file = $("cv-file").files[0];

    if (!jobId || !file) {
      message("application-message", "Select a job and attach your CV.");
      return;
    }

    const allowed = /\.(pdf|doc|docx)$/i.test(file.name);

    if (!allowed || file.size > 5 * 1024 * 1024) {
      message("application-message", "Upload a PDF, DOC or DOCX file up to 5 MB.");
      return;
    }

    const { data: job, error: jobError } = await db.from("jobs")
      .select("id")
      .eq("id", jobId)
      .eq("status", "approved")
      .maybeSingle();

    if (jobError || !job) {
      message("application-message", "This job is not available for applications.");
      return;
    }

    message("application-message", "Uploading your CV...");

    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const cvPath = `${user.id}/${crypto.randomUUID()}-${safeName}`;

    const { error: uploadError } = await db.storage
      .from("cv-files")
      .upload(cvPath, file, {
        upsert: false
      });

    if (uploadError) {
      message("application-message", uploadError.message);
      return;
    }

    const { error } = await db.from("applications").insert({
      job_id: jobId,
      applicant_id: user.id,
      applicant_name: $("applicant-name").value.trim(),
      phone: $("applicant-phone").value.trim(),
      cover_note: $("cover-note").value.trim(),
      cv_path: cvPath,
      status: "submitted"
    });

    if (error) {
      await db.storage.from("cv-files").remove([cvPath]);
      message("application-message", error.message);
      return;
    }

    $("application-form").reset();
    $("application-job-id").value = jobId;
    message("application-message", "Application submitted successfully!");
  });

  // DASHBOARD
  async function loadDashboard() {
    if (!$("dashboard-name") || !requireDatabase()) return;

    const user = await getUser();

    if (!user) {
      location.href = "login.html";
      return;
    }

    const role = user.user_metadata?.role || "job_seeker";
    $("dashboard-name").textContent =
      user.user_metadata?.full_name || user.email;
    $("dashboard-role").textContent =
      role === "employer" ? "Employer account" : "Job seeker account";

    if (role === "job_seeker") {
      $("my-jobs")?.closest(".dashboard-section")?.setAttribute("hidden", "");
      $("job-applicants")?.closest(".dashboard-section")?.setAttribute("hidden", "");

      const { data, error } = await db.from("applications")
        .select("id, status, created_at, jobs(title, company)")
        .eq("applicant_id", user.id)
        .order("created_at", { ascending: false });

      const box = $("my-applications");

      if (error) {
        box.textContent = error.message;
        return;
      }

      box.innerHTML = data.length ? data.map(item => `
        <article class="feature-card">
          <h3>${escapeHTML(item.jobs?.title || "Job")}</h3>
          <p>${escapeHTML(item.jobs?.company || "")}</p>
          <p>Application status: <strong>${escapeHTML(item.status)}</strong></p>
        </article>
      `).join("") : "You have not applied for any jobs yet.";

    } else if (role === "employer") {
      $("my-applications")?.closest(".dashboard-section")?.setAttribute("hidden", "");

      const { data: jobs, error } = await db.from("jobs")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) {
        $("my-jobs").textContent = error.message;
        return;
      }

      $("my-jobs").innerHTML = jobs.length ? jobs.map(job => `
        <article class="feature-card">
          <h3>${escapeHTML(job.title)}</h3>
          <p>${escapeHTML(job.company)}</p>
          <p>Review status: ${escapeHTML(job.status)}</p>
        </article>
      `).join("") : "You have not posted any jobs yet.";

      const jobIds = jobs.map(job => job.id);
      const applicantsBox = $("job-applicants");

      if (!jobIds.length) {
        applicantsBox.textContent = "No applicants yet.";
        return;
      }

      const { data: applicants, error: applicantError } = await db.from("applications")
        .select("id, job_id, applicant_name, phone, cover_note, cv_path, status, jobs(title)")
        .in("job_id", jobIds)
        .order("created_at", { ascending: false });

      if (applicantError) {
        applicantsBox.textContent = applicantError.message;
        return;
      }

      applicantsBox.innerHTML = applicants.length ? applicants.map(app => `
        <article class="feature-card">
          <h3>${escapeHTML(app.applicant_name)}</h3>
          <p>Job: ${escapeHTML(app.jobs?.title || "")}</p>
          <p>Phone: ${escapeHTML(app.phone)}</p>
          <p>${escapeHTML(app.cover_note)}</p>
          <p>Status: ${escapeHTML(app.status)}</p>
          <select data-status-id="${escapeHTML(app.id)}">
            <option value="submitted">Submitted</option>
            <option value="shortlisted">Shortlisted</option>
            <option value="accepted">Accepted</option>
            <option value="rejected">Rejected</option>
          </select>
          <button class="btn btn-primary"
            data-save-status="${escapeHTML(app.id)}">Update status</button>
          <button class="btn btn-outline"
            data-view-cv="${escapeHTML(app.id)}">View CV</button>
        </article>
      `).join("") : "No applicants yet.";

      applicants.forEach(app => {
        const select = applicantsBox.querySelector(
          `[data-status-id="${CSS.escape(app.id)}"]`
        );
        if (select) select.value = app.status;
      });

      applicantsBox.addEventListener("click", async event => {
        const statusId = event.target.dataset.saveStatus;
        const cvId = event.target.dataset.viewCv;

        if (statusId) {
          const select = applicantsBox.querySelector(
            `[data-status-id="${CSS.escape(statusId)}"]`
          );

          const { error } = await db.from("applications")
            .update({ status: select.value })
            .eq("id", statusId);

          alert(error ? error.message : "Application status updated.");
        }

        if (cvId) {
          const app = applicants.find(item => item.id === cvId);
          if (!app) return;

          const { data, error } = await db.storage
            .from("cv-files")
            .createSignedUrl(app.cv_path, 60);

          if (error) {
            alert(error.message);
            return;
          }

          window.open(data.signedUrl, "_blank", "noopener");
        }
      });
    }
  }

  // START PAGE FUNCTIONS
  if (location.pathname.endsWith("jobs.html")) loadJobs();
  if (location.pathname.endsWith("job.html")) loadJobDetails();
  if (location.pathname.endsWith("apply.html")) prepareApplication();
  if (location.pathname.endsWith("dashboard.html")) loadDashboard();
})();
        
