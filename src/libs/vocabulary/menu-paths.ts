import type { Menu } from '@prisma/client';

type MenuNode = Pick<Menu, 'id' | 'parentId' | 'slug' | 'systemKey'>;

export function vocabularyMenuPaths(menus: readonly MenuNode[]) {
	const paths = new Map<string, string[]>();
	const root = menus.find(({ systemKey }) => systemKey === 'VOCABULARY');
	if (!root) return paths;

	const children = new Map<string, MenuNode[]>();
	for (const menu of menus) {
		if (!menu.parentId) continue;
		const siblings = children.get(menu.parentId);
		if (siblings) siblings.push(menu);
		else children.set(menu.parentId, [menu]);
	}

	const queue = [root.id];
	paths.set(root.id, []);
	for (const id of queue) {
		const parentPath = paths.get(id)!;
		for (const child of children.get(id) ?? []) {
			if (paths.has(child.id)) continue;
			paths.set(child.id, [...parentPath, child.slug]);
			queue.push(child.id);
		}
	}
	paths.delete(root.id);
	return paths;
}
