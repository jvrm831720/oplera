# Third-party notices

This project was bootstrapped from `decocms/mcp-app`, Copyright © 2025 Deco CMS and contributors, distributed under the MIT License.

The complete dependency license inventory is available from the package manager lockfiles. Product code in this repository does not include or claim ownership of WhatsApp or Meta trademarks.

## Comp AI CRM frontend port

Oplera V0.4.2 includes substantial portions of frontend code ported and adapted from:

- Project: Comp AI CRM
- Source: https://github.com/trycompai/crm
- Upstream branch: `release`
- Upstream commit: `6d4793dd6d7aeea91aa6a034e00b17d7408a2d08`
- License: MIT License
- Copyright (c) 2026 Comp AI

Ported material includes visual design tokens and selected UI/layout primitives derived from `packages/ui`, plus shell and agent-composer interaction patterns from `apps/app/components`. Imports, runtime bindings, product copy, navigation, icons and branding were adapted for Oplera's React/Vite frontend. Comp AI logos, favicons, trademarks, proprietary deployment configuration, authentication, database logic, server actions and demo identities are not reused.

The upstream MIT license is reproduced below as required for substantial portions of the Software:

```text
MIT License

Copyright (c) 2026 Comp AI

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Oplera V0.4 architectural references

The following MIT-licensed projects were studied as architectural references during the earlier Oplera V0.4 work:

- `trycompai/crm`: agentic-first operation, work queue concepts, dueAt scheduling, leasing patterns, execution budgets and operational UI patterns.
- `melgarafael/DeskcommCRM`: AI-to-human handoff, conversation state, policy/governance and audit concepts.
- `Vision70s/crm-ai-agent`: scoring, pending action, human approval and decision-log concepts.

The V0.4 backend implementation expressed those architectural concepts independently. The explicit source-code reuse described above begins with the V0.4.2 frontend port.
