import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeSanitize from "rehype-sanitize";

/* Markdown 正文渲染：GFM（表格/任务列表/删除线）+ 白名单过滤防 XSS；
   图片懒加载。样式见 home.css 的 .markdown-body */
const MarkdownBody = memo(function MarkdownBody({ md }) {
	return (
		<div className="markdown-body">
			<ReactMarkdown
				remarkPlugins={[remarkGfm]}
				rehypePlugins={[rehypeSanitize]}
				components={{
					img: (props) => (
						<img {...props} loading="lazy" decoding="async" alt={props.alt ?? ""} />
					),
				}}
			>
				{md}
			</ReactMarkdown>
		</div>
	);
});

export default MarkdownBody;
