export const VIRT_PREFIX = 'virt_';
export const VIRT_SWIMLANE_PREFIX = 'virt_sw_';
export const VIRT_GOAL_PREFIX = 'virt_gl_';
export const VIRT_MILESTONE_PREFIX = 'virt_ms_';
export const VIRT_TODO_PREFIX = 'virt_td_';

export function isVirtual(id: string): boolean {
    return id.startsWith(VIRT_PREFIX);
}

export function isVirtualGoal(id: string): boolean {
    return id.startsWith(VIRT_GOAL_PREFIX);
}

export function isVirtualMilestone(id: string): boolean {
    return id.startsWith(VIRT_MILESTONE_PREFIX);
}

export function isVirtualTodo(id: string): boolean {
    return id.startsWith(VIRT_TODO_PREFIX);
}

export function stripVirtualPrefix(id: string): string {
    if (id.startsWith(VIRT_GOAL_PREFIX)) { return id.slice(VIRT_GOAL_PREFIX.length); }
    if (id.startsWith(VIRT_MILESTONE_PREFIX)) { return id.slice(VIRT_MILESTONE_PREFIX.length); }
    if (id.startsWith(VIRT_TODO_PREFIX)) { return id.slice(VIRT_TODO_PREFIX.length); }
    if (id.startsWith(VIRT_SWIMLANE_PREFIX)) { return id.slice(VIRT_SWIMLANE_PREFIX.length); }
    return id;
}

export type VirtualItemKind = 'radar' | 'goal' | 'milestone' | 'todo';

export function getVirtualItemKind(id: string): VirtualItemKind {
    if (isVirtualGoal(id)) { return 'goal'; }
    if (isVirtualMilestone(id)) { return 'milestone'; }
    if (isVirtualTodo(id)) { return 'todo'; }
    return 'radar';
}
