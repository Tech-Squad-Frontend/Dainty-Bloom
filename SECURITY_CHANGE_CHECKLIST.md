# Dainty Bloom Security Change Checklist

Before requesting review or merging a change, verify each applicable item:

- [ ] Does this change expose customer names, email, phone, addresses, orders,
      payment information, artwork, custom requests or account identifiers?
- [ ] Does it introduce a new endpoint or route?
- [ ] Does it return a Mongoose document or other broad object instead of a DTO?
- [ ] Does it access or modify another customer's resource?
- [ ] Does it access or modify a guest user's cart, artwork or order?
- [ ] Does it use authentication and the correct role/permission middleware?
- [ ] Does a staff-sensitive operation require recent MFA?
- [ ] Does a mutating endpoint retain CSRF and Zod validation?
- [ ] Does a new payment flow use server-calculated totals and payment provider
      signature verification?
- [ ] Could a browser redirect mark payment or an order as successful?
- [ ] Could a duplicate webhook or retry fulfill a payment twice?
- [ ] Does it introduce an upload or download route?
- [ ] Does it use real file-type detection, SVG/PDF checks, malware scanning,
      private storage and ownership checks?
- [ ] Does it change cookies, CORS, CSP, HSTS or forwarding trust?
- [ ] Does it introduce a new external integration or credential?
- [ ] Are production secrets supplied only through hosting environment/secret
      configuration?
- [ ] Does it modify database roles, TLS assumptions, backups or restoration?
- [ ] Are allowed and forbidden behavior covered by tests?
- [ ] Is cross-customer isolation tested for the resource type?
- [ ] Is webhook replay/duplicate-event behavior tested?
- [ ] Does it pass dependency audit, lint, type checks and production builds?
- [ ] Did a new route appear in the route inventory and security architecture test?
