"use client";

import { FormEvent, useEffect, useState } from "react";
import { ArrowRight, BadgeCheck, CalendarDays, Clock3, Headphones, Home, LockKeyhole, Mail, Phone, ShieldCheck } from "lucide-react";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { YuuFeedback as Feedback, YuuFormField as FormField, YuuPanelTitle as PanelTitle, YuuPrimaryButton as PanelButton } from "@/components/yuu/primitives";
import { type OwnerListingInput, type ServerListing, type SupportTicket, type Viewing, type YuuRole, type YuuUser, uploadListingPhoto, yuuApi } from "@/lib/client/yuu-api";

type Panel = "account" | "viewing" | "owner" | "admin" | "support";

type ProductFlowsProps = {
  open: Panel | null;
  onOpenChange: (panel: Panel | null) => void;
  viewingListing: { id: string | number; title: string } | null;
  user: YuuUser | null;
  onUserChange: (user: YuuUser | null) => void;
};

function getMessage(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong. Please try again.";
}

function localDateTimeMin() {
  const now = new Date(Date.now() + 60_000);
  return new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

export function ProductFlows({ open, onOpenChange, viewingListing, user, onUserChange }: ProductFlowsProps) {
  const [authMode, setAuthMode] = useState<"login" | "register" | "phone">("login");
  const [authPending, setAuthPending] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authSuccess, setAuthSuccess] = useState("");
  const [phone, setPhone] = useState("");
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [phoneMockCode, setPhoneMockCode] = useState("");
  const [viewingPending, setViewingPending] = useState(false);
  const [viewingError, setViewingError] = useState("");
  const [viewingSuccess, setViewingSuccess] = useState("");
  const [ownerPending, setOwnerPending] = useState(false);
  const [ownerError, setOwnerError] = useState("");
  const [ownerSuccess, setOwnerSuccess] = useState("");
  const [ownerProgress, setOwnerProgress] = useState("");
  const [ownerListings, setOwnerListings] = useState<ServerListing[]>([]);
  const [adminPending, setAdminPending] = useState(false);
  const [adminError, setAdminError] = useState("");
  const [adminListings, setAdminListings] = useState<ServerListing[]>([]);
  const [adminUsers, setAdminUsers] = useState<YuuUser[]>([]);
  const [adminTab, setAdminTab] = useState<"listings" | "users">("listings");
  const [rejectingId, setRejectingId] = useState<string | number | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");
  const [supportPending, setSupportPending] = useState(false);
  const [supportError, setSupportError] = useState("");
  const [supportSuccess, setSupportSuccess] = useState("");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [viewings, setViewings] = useState<Viewing[]>([]);

  useEffect(() => {
    if (open !== "account" || !user) return;
    void yuuApi.viewings().then((result) => setViewings(result.items ?? [])).catch(() => setViewings([]));
  }, [open, user]);

  useEffect(() => {
    if (open !== "owner" || !user) return;
    void yuuApi.ownerListings().then((result) => setOwnerListings(result.items ?? [])).catch(() => setOwnerListings([]));
  }, [open, user]);

  useEffect(() => {
    if (open !== "admin" || user?.role !== "admin") return;
    void yuuApi.adminListings().then((result) => setAdminListings(result.items ?? [])).catch((error) => setAdminError(getMessage(error)));
    void yuuApi.adminUsers().then((result) => setAdminUsers(result.items ?? [])).catch((error) => setAdminError(getMessage(error)));
  }, [open, user]);

  useEffect(() => {
    if (open !== "support" || !user) return;
    void yuuApi.tickets().then((result) => setTickets(result.items ?? [])).catch(() => setTickets([]));
  }, [open, user]);

  const authenticate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");
    setAuthSuccess("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email") ?? "").trim().toLowerCase();
    const password = String(form.get("password") ?? "");
    if (!email.includes("@") || password.length < 12) {
      setAuthError("Enter a valid email and a password with at least 12 characters.");
      return;
    }
    setAuthPending(true);
    try {
      const response = authMode === "register"
        ? await yuuApi.register({ name: String(form.get("name") ?? "").trim(), email, password })
        : await yuuApi.login({ email, password });
      onUserChange(response.user);
      setAuthSuccess(authMode === "register" ? "Your account is ready." : "Welcome back.");
    } catch (error) {
      setAuthError(getMessage(error));
    } finally {
      setAuthPending(false);
    }
  };

  const startPhone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthError("");
    const normalized = phone.replace(/[\s()-]/g, "");
    if (!/^\+[1-9]\d{7,14}$/.test(normalized)) {
      setAuthError("Use the international format, for example +1 555 010 0000.");
      return;
    }
    setAuthPending(true);
    try {
      const result = await yuuApi.startPhone(normalized);
      setPhone(normalized);
      setPhoneCodeSent(true);
      setPhoneMockCode(result.mockCode ?? "");
      setAuthSuccess("Verification code requested.");
    } catch (error) {
      setAuthError(getMessage(error));
    } finally {
      setAuthPending(false);
    }
  };

  const verifyPhone = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setAuthPending(true);
    setAuthError("");
    try {
      const code = String(new FormData(event.currentTarget).get("code") ?? "").trim();
      const result = await yuuApi.verifyPhone(phone, code);
      onUserChange(result.user);
      setAuthSuccess("Phone verified. You are signed in.");
    } catch (error) {
      setAuthError(getMessage(error));
    } finally {
      setAuthPending(false);
    }
  };

  const submitViewing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    if (!viewingListing) return;
    setViewingPending(true);
    setViewingError("");
    setViewingSuccess("");
    const form = new FormData(formElement);
    const requestedAt = String(form.get("requestedAt") ?? "");
    if (!requestedAt || new Date(requestedAt).getTime() < Date.now()) {
      setViewingError("Choose a future date and time.");
      setViewingPending(false);
      return;
    }
    try {
      await yuuApi.createViewing({ listingId: viewingListing.id, requestedAt: new Date(requestedAt).toISOString(), notes: String(form.get("notes") ?? "").trim() });
      setViewingSuccess("Your viewing request was sent. Track its status in your account.");
      formElement.reset();
    } catch (error) {
      setViewingError(getMessage(error));
    } finally {
      setViewingPending(false);
    }
  };

  const submitListing = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setOwnerPending(true);
    setOwnerError("");
    setOwnerSuccess("");
    const form = new FormData(formElement);
    const value: OwnerListingInput = {
      title: String(form.get("title") ?? "").trim(),
      description: String(form.get("description") ?? "").trim(),
      city: String(form.get("city") ?? "Bangkok").trim(),
      district: String(form.get("district") ?? "").trim(),
      approximateAddress: String(form.get("approximateAddress") ?? "").trim(),
      monthlyRent: Number(form.get("monthlyRent")),
      depositMonths: Number(form.get("depositMonths")),
      bedrooms: Number(form.get("bedrooms")),
      bathrooms: Number(form.get("bathrooms")),
      areaSqm: Number(form.get("areaSqm")),
      mediaUrls: [],
      oneTimeFeesTHB: form.get("oneTimeFeesTHB") === "" ? null : Number(form.get("oneTimeFeesTHB")),
      recurringFeesTHB: form.get("recurringFeesTHB") === "" ? null : Number(form.get("recurringFeesTHB")),
      agentFeeTHB: form.get("agentFeeTHB") === "" ? null : Number(form.get("agentFeeTHB")),
      propertyType: String(form.get("propertyType") || "condo") as OwnerListingInput["propertyType"],
      availableFrom: String(form.get("availableFrom") || "") || null,
      minimumLeaseMonths: form.get("minimumLeaseMonths") === "" ? null : Number(form.get("minimumLeaseMonths")),
      transitStation: String(form.get("transitStation") || "").trim() || null,
      transitWalkMinutes: form.get("transitWalkMinutes") === "" ? null : Number(form.get("transitWalkMinutes")),
    };
    const photos = form.getAll("photos").filter((file): file is File => file instanceof File && file.size > 0);
    if (value.title.length < 8 || value.description.length < 40 || value.monthlyRent < 1000 || value.areaSqm < 8 || photos.length === 0) {
      setOwnerError("Add a detailed title (8+ characters), description (40+), rent from ฿1,000, area from 8 m² and at least one photo.");
      setOwnerPending(false);
      return;
    }
    try {
      for (const [index, photo] of photos.entries()) {
        setOwnerProgress(`Uploading photo ${index + 1} of ${photos.length}…`);
        const uploaded = await uploadListingPhoto(photo);
        value.mediaUrls.push(uploaded.url);
      }
      setOwnerProgress("Submitting listing…");
      const result = await yuuApi.createOwnerListing(value);
      setOwnerListings((current) => [result.listing, ...current]);
      setOwnerSuccess("Listing submitted for review. Its address stays approximate until a viewing is confirmed.");
      formElement.reset();
    } catch (error) {
      setOwnerError(getMessage(error));
    } finally {
      setOwnerPending(false);
      setOwnerProgress("");
    }
  };

  const moderate = async (listing: ServerListing, status: "published" | "rejected") => {
    const reason = status === "rejected" ? rejectionReason.trim() : undefined;
    if (status === "rejected" && !reason) { setAdminError("Add a reason before rejecting this listing."); return; }
    setAdminPending(true);
    setAdminError("");
    try {
      await yuuApi.moderateListing(listing.id, status, reason);
      setAdminListings((current) => current.filter((item) => item.id !== listing.id));
      setRejectingId(null);
      setRejectionReason("");
    } catch (error) {
      setAdminError(getMessage(error));
    } finally {
      setAdminPending(false);
    }
  };

  const updateAdminUser = async (target: YuuUser, value: { role?: YuuRole; verified?: boolean }) => {
    setAdminPending(true);
    setAdminError("");
    try {
      const result = await yuuApi.updateUser(target.id, value);
      setAdminUsers((current) => current.map((item) => item.id === target.id ? result.user : item));
    } catch (error) {
      setAdminError(getMessage(error));
    } finally {
      setAdminPending(false);
    }
  };

  const reviewCheck = async (listing: ServerListing, kind: "identity" | "ownership" | "media" | "lease", status: "passed" | "failed") => {
    setAdminPending(true);
    setAdminError("");
    try {
      const result = await yuuApi.reviewListingCheck(listing.id, { kind, status, publicNote: status === "passed" ? `${kind} reviewed by YUU` : `${kind} needs more information` });
      setAdminListings((current) => current.map((item) => item.id === listing.id ? { ...item, checks: [...(item.checks || []).filter((check) => check.kind !== kind), result.check] } : item));
    } catch (error) {
      setAdminError(getMessage(error));
    } finally {
      setAdminPending(false);
    }
  };

  const saveListingCost = async (event: FormEvent<HTMLFormElement>, listing: ServerListing) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const oneTimeFeesTHB = Number(form.get("oneTimeFeesTHB"));
    const recurringFeesTHB = Number(form.get("recurringFeesTHB"));
    const agentFeeTHB = Number(form.get("agentFeeTHB"));
    if ([oneTimeFeesTHB, recurringFeesTHB, agentFeeTHB].some((amount) => !Number.isSafeInteger(amount) || amount < 0)) {
      setAdminError("Enter non-negative whole THB amounts for all fees.");
      return;
    }
    setAdminPending(true);
    setAdminError("");
    try {
      const response = await yuuApi.updateListingCost(listing.id, { oneTimeFeesTHB, recurringFeesTHB, agentFeeTHB });
      setAdminListings((current) => current.map((item) => item.id === listing.id ? { ...item, ...response.listing, checks: item.checks?.map((check) => check.kind === "lease" ? { ...check, status: "pending" } : check) } : item));
    } catch (error) {
      setAdminError(getMessage(error));
    } finally {
      setAdminPending(false);
    }
  };

  const submitTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const formElement = event.currentTarget;
    setSupportPending(true);
    setSupportError("");
    setSupportSuccess("");
    const form = new FormData(formElement);
    try {
      const result = await yuuApi.createTicket({ subject: String(form.get("subject") ?? "").trim(), message: String(form.get("message") ?? "").trim() });
      setTickets((current) => [result.ticket, ...current]);
      setSupportSuccess("Your request was received. You can check its status here.");
      formElement.reset();
    } catch (error) {
      setSupportError(getMessage(error));
    } finally {
      setSupportPending(false);
    }
  };

  const signOut = async () => {
    setAuthPending(true);
    setAuthError("");
    try {
      await yuuApi.logout();
      onUserChange(null);
      setViewings([]);
      setOwnerListings([]);
      setTickets([]);
      setAuthSuccess("Signed out.");
    } catch (error) {
      setAuthError(getMessage(error));
    } finally {
      setAuthPending(false);
    }
  };

  return <>
    <Sheet open={open === "account"} onOpenChange={(next) => !next && onOpenChange(null)}>
      <SheetContent className="account-panel yuu-service-panel sm:max-w-[500px]" side="right">
        <PanelTitle title={user ? "Your YUU account" : "Welcome to YUU"} description={user ? "Viewings and account details in one place." : "Save homes and arrange viewings in one place."} />
        <div className="yuu-panel-scroll">
          {user ? <div className="yuu-account-home">
            <div className="yuu-identity"><div><strong>{user.name || user.email || user.phone || "YUU member"}</strong><span>{user.email || user.phone || "Signed in"}</span></div><span className="yuu-state-pill"><BadgeCheck size={15} /> {user.role}</span></div>
            <section className="yuu-panel-section"><h3>Your viewings</h3>{viewings.length ? viewings.map((item) => <div className="yuu-record" key={item.id}><CalendarDays size={18} /><div><strong>{item.listing?.title || `Home #${item.listingId}`}</strong><span>{new Date(item.requestedAt).toLocaleString()} · {item.status || "Requested"}</span></div></div>) : <p className="yuu-muted">No viewing requests yet. Browse a home and choose a time.</p>}</section>
            <button className="yuu-panel-secondary" type="button" onClick={() => void signOut()} disabled={authPending}>Sign out</button>
          </div> : <>
            <div className="yuu-tabs" role="tablist" aria-label="Sign in method"><button className={authMode === "login" ? "active" : ""} onClick={() => { setAuthMode("login"); setAuthError(""); }}>Sign in</button><button className={authMode === "register" ? "active" : ""} onClick={() => { setAuthMode("register"); setAuthError(""); }}>Sign up</button><button className={authMode === "phone" ? "active" : ""} onClick={() => { setAuthMode("phone"); setAuthError(""); }}><Phone size={16} /> Phone</button></div>
            {authMode === "phone" ? phoneCodeSent ? <form key="phone-verify" className="yuu-form" onSubmit={(event) => void verifyPhone(event)}><p className="yuu-muted">Enter the code sent to {phone}.</p><FormField label="Verification code"><input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} required /></FormField>{phoneMockCode && <p className="yuu-dev-code">Local preview code: <strong>{phoneMockCode}</strong></p>}<PanelButton pending={authPending}>Verify phone</PanelButton><button className="yuu-text-action" type="button" onClick={() => { setPhoneCodeSent(false); setPhoneMockCode(""); }}>Change number</button></form> : <form key="phone-start" className="yuu-form" onSubmit={(event) => void startPhone(event)}><FormField label="Phone number" hint="Include country code, for example +66 for Thailand."><input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} autoComplete="tel" placeholder="+1 555 010 0000" required /></FormField><PanelButton pending={authPending}>Send code</PanelButton></form>
              : <form key={authMode} className="yuu-form" onSubmit={(event) => void authenticate(event)}>{authMode === "register" && <FormField label="Full name"><input name="name" autoComplete="name" minLength={2} required /></FormField>}<FormField label="Email address"><input name="email" type="email" autoComplete="email" required /></FormField><FormField label="Password" hint={authMode === "register" ? "At least 12 characters." : undefined}><input name="password" type="password" autoComplete={authMode === "register" ? "new-password" : "current-password"} minLength={12} required /></FormField><PanelButton pending={authPending}>{authMode === "register" ? "Create account" : "Sign in"}</PanelButton></form>}
            <div className="yuu-auth-note"><LockKeyhole size={17} /><p>Your session stays on this device. We never show your exact home address in public search results.</p></div>
          </>}
          {authError && <Feedback kind="error">{authError}</Feedback>}{authSuccess && <Feedback>{authSuccess}</Feedback>}
        </div>
      </SheetContent>
    </Sheet>

    <Sheet open={open === "viewing"} onOpenChange={(next) => !next && onOpenChange(null)}>
      <SheetContent className="yuu-service-panel sm:max-w-[500px]" side="right">
        <PanelTitle title="Request a viewing" description={viewingListing?.title || "Choose a time to visit the home."} />
        <div className="yuu-panel-scroll"><div className="yuu-context-note"><CalendarDays size={19} /><span>The owner confirms the time before your visit.</span></div>
          <form className="yuu-form" onSubmit={(event) => void submitViewing(event)}><FormField label="Preferred date and time"><input name="requestedAt" type="datetime-local" min={localDateTimeMin()} required /></FormField><FormField label="Message to the owner" hint="Optional. Mention your move-in timing or any questions."><textarea name="notes" rows={4} maxLength={1000} /></FormField><PanelButton pending={viewingPending}>Send request</PanelButton></form>
          {viewingError && <Feedback kind="error">{viewingError}</Feedback>}{viewingSuccess && <Feedback>{viewingSuccess}</Feedback>}
          {viewingError && !user && <button className="yuu-panel-secondary" onClick={() => onOpenChange("account")}>Sign in to continue <ArrowRight size={16} /></button>}
        </div>
      </SheetContent>
    </Sheet>

    <Sheet open={open === "owner"} onOpenChange={(next) => !next && onOpenChange(null)}>
      <SheetContent className="yuu-service-panel yuu-wide-panel sm:max-w-[600px]" side="right">
        <PanelTitle title="List your home" description="Give renters the facts they need. Every home is reviewed before it appears in search." />
        <div className="yuu-panel-scroll"><div className="yuu-context-note"><ShieldCheck size={19} /><span>We show an approximate area until a viewing is arranged.</span></div>
          <form className="yuu-form" onSubmit={(event) => void submitListing(event)}>
            <FormField label="Listing title"><input name="title" minLength={8} maxLength={120} placeholder="One-bedroom condo near BTS On Nut" required /></FormField>
            <FormField label="Description"><textarea name="description" rows={4} minLength={40} maxLength={3000} placeholder="Describe the layout, condition, transport and what makes the home practical for a long stay." required /></FormField>
            <div className="yuu-two-col">
              <FormField label="City"><input name="city" defaultValue="Bangkok" required /></FormField>
              <FormField label="District"><input name="district" placeholder="On Nut" required /></FormField>
            </div>
            <FormField label="Approximate address" hint="Do not include a unit number or private access details."><input name="approximateAddress" placeholder="Sukhumvit 77" required /></FormField>
            <div className="yuu-two-col">
              <FormField label="Home type"><select name="propertyType"><option value="condo">Condo</option><option value="apartment">Apartment</option><option value="house">House</option></select></FormField>
              <FormField label="Area (m²)"><input name="areaSqm" type="number" min={8} max={10000} step={1} required /></FormField>
              <FormField label="Bedrooms"><input name="bedrooms" type="number" min={0} max={20} step={1} defaultValue={1} required /></FormField>
              <FormField label="Bathrooms"><input name="bathrooms" type="number" min={1} max={20} step={1} defaultValue={1} required /></FormField>
            </div>
            <div className="yuu-two-col">
              <FormField label="Rent per month (THB)"><input name="monthlyRent" type="number" min={1000} step={1} required /></FormField>
              <FormField label="Deposit (months)"><input name="depositMonths" type="number" min={0} max={6} step={1} defaultValue={1} required /></FormField>
              <FormField label="One-time fees (THB)" hint="Enter 0 when confirmed free."><input name="oneTimeFeesTHB" type="number" min={0} step={1} /></FormField>
              <FormField label="Agent fee (THB)" hint="Enter 0 when confirmed free."><input name="agentFeeTHB" type="number" min={0} step={1} /></FormField>
              <FormField label="Monthly extras (THB)" hint="Utilities or recurring services, if fixed."><input name="recurringFeesTHB" type="number" min={0} step={1} /></FormField>
              <FormField label="Available from"><input name="availableFrom" type="date" /></FormField>
              <FormField label="Minimum lease (months)"><input name="minimumLeaseMonths" type="number" min={1} max={60} step={1} /></FormField>
              <FormField label="Walk to transit (minutes)"><input name="transitWalkMinutes" type="number" min={0} max={120} step={1} /></FormField>
            </div>
            <FormField label="Transit station"><input name="transitStation" placeholder="BTS On Nut" /></FormField>
            <FormField label="Home photos" hint="JPEG, PNG or WebP, up to 10 MB each. Add clear photos of every room."><input name="photos" type="file" accept="image/jpeg,image/png,image/webp" multiple required /></FormField>
            {ownerProgress && <p className="yuu-muted" role="status">{ownerProgress}</p>}
            <PanelButton pending={ownerPending}>Submit for review</PanelButton>
          </form>
          {ownerError && <Feedback kind="error">{ownerError}</Feedback>}{ownerSuccess && <Feedback>{ownerSuccess}</Feedback>}
          {ownerError && !user && <button className="yuu-panel-secondary" onClick={() => onOpenChange("account")}>Sign in to continue <ArrowRight size={16} /></button>}
          {user && <section className="yuu-panel-section"><h3>Your listings</h3>{ownerListings.length ? ownerListings.map((item) => <div className="yuu-record" key={item.id}><Home size={18} /><div><strong>{item.title}</strong><span>฿{Number(item.monthlyRent || 0).toLocaleString()} / month · {item.status || "Pending review"}</span></div></div>) : <p className="yuu-muted">No listings submitted yet.</p>}</section>}
        </div>
      </SheetContent>
    </Sheet>

    <Sheet open={open === "admin"} onOpenChange={(next) => !next && onOpenChange(null)}>
      <SheetContent className="yuu-service-panel yuu-wide-panel sm:max-w-[650px]" side="right">
        <PanelTitle title="Listing review" description="Check details and media before a home becomes visible to renters." />
        <div className="yuu-panel-scroll">{user?.role !== "admin" ? <Feedback kind="error">Admin access is required.</Feedback> : <>
          <div className="yuu-tabs yuu-admin-tabs" role="tablist" aria-label="Admin section">
            <button className={adminTab === "listings" ? "active" : ""} onClick={() => setAdminTab("listings")}>Listings</button>
            <button className={adminTab === "users" ? "active" : ""} onClick={() => setAdminTab("users")}>Users</button>
          </div>
          {adminError && <Feedback kind="error">{adminError}</Feedback>}
          {adminTab === "listings" ? adminListings.length ? adminListings.map((item) => {
            const kinds = ["identity", "ownership", "media", "lease"] as const;
            const checksPassed = kinds.every((kind) => item.checks?.find((check) => check.kind === kind)?.status === "passed");
            const feesConfirmed = item.oneTimeFeesTHB != null && item.recurringFeesTHB != null && item.agentFeeTHB != null;
            return <article className="yuu-review-card" key={item.id}>
              <div><span className="yuu-state-pill">Pending review</span><h3>{item.title}</h3><p>{item.district}, {item.city} · ฿{Number(item.monthlyRent || 0).toLocaleString()} / month</p><p>{item.description}</p>{item.mediaUrls?.length ? <a href={item.mediaUrls[0]} target="_blank" rel="noopener noreferrer">View submitted photo <ArrowRight size={14} /></a> : <span className="yuu-field-error">No media submitted</span>}</div>
              <form className="yuu-admin-cost" onSubmit={(event) => void saveListingCost(event, item)}><strong>Confirm all fees</strong><div><label>One-time <input name="oneTimeFeesTHB" type="number" min={0} step={1} defaultValue={item.oneTimeFeesTHB ?? ""} required /></label><label>Recurring / month <input name="recurringFeesTHB" type="number" min={0} step={1} defaultValue={item.recurringFeesTHB ?? ""} required /></label><label>Agent <input name="agentFeeTHB" type="number" min={0} step={1} defaultValue={item.agentFeeTHB ?? ""} required /></label></div><button type="submit" disabled={adminPending}>Save fees</button></form>
              <div className="yuu-check-grid">{kinds.map((kind) => {
                const check = item.checks?.find((value) => value.kind === kind);
                return <div className="yuu-check-row" key={kind}><span><strong>{kind}</strong><small>{check?.status || "pending"}</small></span><div><button className={check?.status === "failed" ? "active-fail" : ""} disabled={adminPending} onClick={() => void reviewCheck(item, kind, "failed")}>Fail</button><button className={check?.status === "passed" ? "active-pass" : ""} disabled={adminPending} onClick={() => void reviewCheck(item, kind, "passed")}>Pass</button></div></div>;
              })}</div>
              {!feesConfirmed && <p className="yuu-field-error">All fee amounts must be confirmed before publishing.</p>}
              {rejectingId === item.id && <div className="yuu-reject-form"><label className="yuu-form-field"><span>Reason for owner</span><textarea value={rejectionReason} onChange={(event) => setRejectionReason(event.target.value)} rows={3} maxLength={500} required /></label></div>}
              <div className="yuu-review-actions"><button disabled={adminPending} onClick={() => rejectingId === item.id ? void moderate(item, "rejected") : setRejectingId(item.id)}>{rejectingId === item.id ? "Confirm rejection" : "Reject"}</button><button disabled={adminPending || !checksPassed || !feesConfirmed} onClick={() => void moderate(item, "published")}>Publish</button></div>
            </article>;
          }) : !adminError && <div className="yuu-empty"><BadgeCheck size={27} /><h3>Review queue is clear</h3><p>New owner submissions will appear here.</p></div> : adminUsers.length ? adminUsers.map((account) => <div className="yuu-user-row" key={account.id}><div><strong>{account.name || account.email || account.phone || account.id}</strong><span>{account.email || account.phone || "No contact details"}</span></div><label><span>Role</span><select value={account.role} disabled={adminPending || account.id === user.id} onChange={(event) => void updateAdminUser(account, { role: event.target.value as YuuRole })}><option value="renter">Renter</option><option value="owner">Owner</option><option value="support">Support</option><option value="admin">Admin</option></select></label><button className={account.verified ? "verified" : ""} disabled={adminPending || account.id === user.id} onClick={() => void updateAdminUser(account, { verified: !account.verified })}>{account.verified ? "Verified" : "Mark verified"}</button></div>) : <div className="yuu-empty"><h3>No users found</h3></div>}
        </>}</div>
      </SheetContent>
    </Sheet>

    <Sheet open={open === "support"} onOpenChange={(next) => !next && onOpenChange(null)}>
      <SheetContent className="yuu-service-panel sm:max-w-[500px]" side="right">
        <PanelTitle title="How can we help?" description="Send a request any time. Follow its status in your account." />
        <div className="yuu-panel-scroll"><div className="yuu-context-note"><Headphones size={19} /><span>Ticket intake is always available. Response times depend on the support team.</span></div>
          <form className="yuu-form" onSubmit={(event) => void submitTicket(event)}><FormField label="Subject"><input name="subject" minLength={4} maxLength={120} placeholder="Question about a viewing" required /></FormField><FormField label="Tell us what happened"><textarea name="message" minLength={10} maxLength={4000} rows={6} placeholder="Include the home or viewing details that will help us find your request." required /></FormField><PanelButton pending={supportPending}>Send request</PanelButton></form>
          {supportError && <Feedback kind="error">{supportError}</Feedback>}{supportSuccess && <Feedback>{supportSuccess}</Feedback>}
          {supportError && !user && <button className="yuu-panel-secondary" onClick={() => onOpenChange("account")}>Sign in to continue <ArrowRight size={16} /></button>}
          <section className="yuu-panel-section yuu-faq"><h3>Quick answers</h3><details><summary>When is a viewing confirmed?</summary><p>The owner needs to accept your requested time. Check its status in your account before travelling.</p></details><details><summary>Which move-in costs are shown?</summary><p>Rent and deposit are always itemised. Unconfirmed fees are marked clearly, and the total is labelled as a subtotal until every fee is confirmed.</p></details><details><summary>How do I protect my deposit?</summary><p>Photograph the home at move-in, keep the signed inventory, and agree the return process in writing.</p></details></section>
          {user && <section className="yuu-panel-section"><h3>Your requests</h3>{tickets.length ? tickets.map((item) => <div className="yuu-record" key={item.id}><Mail size={18} /><div><strong>{item.subject}</strong><span><Clock3 size={13} /> {item.status || "Open"}{item.createdAt ? ` · ${new Date(item.createdAt).toLocaleDateString()}` : ""}</span></div></div>) : <p className="yuu-muted">No support requests yet.</p>}</section>}
        </div>
      </SheetContent>
    </Sheet>
  </>;
}
