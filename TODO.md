# Ideas and TODOs

These ideas are deferred and can be revisited when needed.

## Diagram layout

- [ ] Automatically arrange ports in composition diagrams to reduce edge crossings.
  
  The generator currently places inputs on the left and outputs on the right. This can create crossings when a component exchanges signals in both directions with the same partner.
  
  Reference: the local, unversioned Toaster example's `Supersystem` composition.
  `user:Hand` connects to `toaster:TouchInterface`, and `toaster:DisplayOutput`
  connects to `user:Eye`. A DOT preview with Hand on the left and Eye on the right, including corresponding changes to the attachment sides, eliminated the crossing between these edges.
  
  Explore a small automatic heuristic that considers the positions of connected partners and chooses port order and attachment sides per instance and diagram.
  Keep signal directions, arrowheads, port identities, and model semantics unchanged. No manual mirroring option or layout annotation should be required
  from the SysLa user. Prefer a limited change to the generator and assess its effect on larger compositions before extending the layout pipeline.
