const fs = require('fs');
let code = fs.readFileSync('src/components/FieldManager.tsx', 'utf8');

// 1. Add getSelectedNodeLabels helper
const helperSnippet = `  const getSelectedNodeLabels = (nodes: TreeNode[], selectedIds: Set<string>): string[] => {
    const result: string[] = [];
    const traverse = (items: TreeNode[]) => {
      for (const n of items) {
        if (selectedIds.has(n.id)) result.push(n.label);
        if (n.children) traverse(n.children);
      }
    };
    traverse(nodes);
    return result;
  };
`;

if (!code.includes('getSelectedNodeLabels')) {
  code = code.replace(
    '  const collectTreePaths = (nodes: TreeNode[], prefix: string = \'\'): string[] => {',
    helperSnippet + '\n  const collectTreePaths = (nodes: TreeNode[], prefix: string = \'\'): string[] => {'
  );
}

// 2. Update renderTreeNodes to support readOnlySelection parameter
const oldRenderTreeNodesSig = 'const renderTreeNodes = (nodes: TreeNode[], depth: number = 0): React.ReactNode => {';
const newRenderTreeNodesSig = 'const renderTreeNodes = (nodes: TreeNode[], depth: number = 0, readOnlySelection: boolean = false): React.ReactNode => {';
code = code.replace(oldRenderTreeNodesSig, newRenderTreeNodesSig);

// In renderTreeNodes: if readOnlySelection is true, disable doubleClick edit and hide actions
code = code.replace(
  `onDoubleClick={(e) => {
                  e.stopPropagation();
                  setEditingTreeNodeId(node.id);
                  setEditingTreeNodeLabel(node.label);
                }}`,
  `onDoubleClick={(e) => {
                  if (readOnlySelection) return;
                  e.stopPropagation();
                  setEditingTreeNodeId(node.id);
                  setEditingTreeNodeLabel(node.label);
                }}`
);

code = code.replace(
  `{/* 액션 버튼 영역 */}
            <div className="fm-tree-node-actions" onClick={e => e.stopPropagation()}>`,
  `{/* 액션 버튼 영역 (선택 전용 모드에서는 숨김) */}
            {!readOnlySelection && (
            <div className="fm-tree-node-actions" onClick={e => e.stopPropagation()}>`
);

code = code.replace(
  `            {/* 하위 노드 추가 인라인 입력 */}
          {isAddingChild && (`,
  `            </div>
            )}
          </div>

          {/* 하위 노드 추가 인라인 입력 */}
          {!readOnlySelection && isAddingChild && (`
);

code = code.replace(
  `          {/* 자식 노드들 (펼쳤을 때만) - 연결선 컨테이너 */}
          {hasChildren && isExpanded && (
            <div className="fm-tree-children">
              {renderTreeNodes(node.children!, depth + 1)}
            </div>
          )}`,
  `          {/* 자식 노드들 (펼쳤을 때만) - 연결선 컨테이너 */}
          {hasChildren && isExpanded && (
            <div className="fm-tree-children">
              {renderTreeNodes(node.children!, depth + 1, readOnlySelection)}
            </div>
          )}`
);

// 3. Update saveField to persist inputGuide
code = code.replace(
  `...(fInputType === 'tree' ? { treeData: fTreeData } : {}),`,
  `...(fInputType === 'tree' ? { treeData: fTreeData, inputGuide: Array.from(selectedTreeNodes) } : {}),`
);

// 4. Update startEditField to restore selectedTreeNodes from inputGuide
code = code.replace(
  `      if (bp.treeData && bp.treeData.length > 0) {
        setSelectedTreeNodes(new Set([bp.treeData[0].id]));
      } else {
        setSelectedTreeNodes(new Set());
      }`,
  `      if (bp.inputGuide && bp.inputGuide.length > 0) {
        setSelectedTreeNodes(new Set(bp.inputGuide));
      } else if (bp.treeData && bp.treeData.length > 0) {
        setSelectedTreeNodes(new Set([bp.treeData[0].id]));
      } else {
        setSelectedTreeNodes(new Set());
      }`
);

fs.writeFileSync('src/components/FieldManager.tsx', code, 'utf8');
console.log('FieldManager.tsx stage 1 updated');
