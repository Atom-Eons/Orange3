export interface SidebarProps {
  activePanel: "mission" | "receipts" | "ethereal";
  collapsed: boolean;
  proofCount: number;
}

export const sidebarDefaults: SidebarProps = {
  activePanel: "mission",
  collapsed: false,
  proofCount: 0,
};
