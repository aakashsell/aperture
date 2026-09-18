# Workspaces

An Aperture workspace is a project boundary. Rollouts, experiments, channels, events, metrics, crash reports, and publishable SDK keys belong to one workspace. The dashboard lets an account owner create multiple workspaces and switch between them from the sidebar selector.

## Create and switch

1. Sign in to the dashboard.
2. Open **Settings & setup** and create another workspace.
3. Use **Switch workspace** in the sidebar to change the active project.
4. Copy the publishable key shown in settings and configure that project's SDK installation with it.

Switching workspaces reloads dashboard data and uses that workspace's key and project-scoped API context. A workspace's data and key remain separate from the other workspaces owned by the account.

## Access model

Currently, only the account owner can see and switch among their workspaces. Team invitations and shared workspace membership are not implemented yet. Dashboard requests identify the selected project, and the API verifies that the authenticated owner owns it before applying any project-scoped operation. SDK API keys continue to identify exactly one project and cannot access dashboard management endpoints.

Workspace creation does not copy data from another project. To move an integration, update its SDK configuration to the destination workspace's publishable key; existing events and assignments stay in their original workspace.
