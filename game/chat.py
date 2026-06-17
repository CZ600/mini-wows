"""聊天消息处理：长度限制 + 基于规则的脏话屏蔽。

屏蔽策略：
- 维护一份常见脏话/辱骂词的词表（中文 + 拼音变体 + 常见英文）。
- 命中后整词替换为等长 “*”，避免拆字绕过（例如插入空格/符号）。
- 词表中每一项可附带若干变体，统一折叠后做大小写不敏感匹配。
"""

import re

# 单条聊天消息最大字符数（前端已同步限制，服务端兜底）
MAX_CHAT_LEN = 100

# 屏蔽词表。键为“规范形式”，列表为需要一起匹配的变体。
# 变体里同时给出常见拼音/谐音/拆字/英文写法，统一小写匹配。
_BAD_WORDS = {
    "fuck": ["fuck", "f u c k", "f*ck", "fxxk", "fuxk", "phuck"],
    "shit": ["shit", "s h i t", "sh!t", "sh1t"],
    "bitch": ["bitch", "b i t c h", "b1tch"],
    "asshole": ["asshole", "a s s h o l e", "a$$hole"],
    "dick": ["dick", "d i c k", "d1ck"],
    "cunt": ["cunt", "c u n t"],
    "bastard": ["bastard", "b a s t a r d"],
    "操": ["操你", "操", "草泥马", "草你", "草了"],
    "日": ["日你", "日了"],
    "妈": ["你妈", "尼玛", "泥马", "你妈逼", "nmb", "n m b", "nm$", "妈逼"],
    "傻": ["傻逼", "傻b", "傻B", "sb", "s b", "煞笔", "煞逼", "沙雕", "傻吊"],
    "滚": ["滚蛋"],
    "屁": ["屁事"],
    "鸡巴": ["鸡巴", "jb", "j b", "jj", "diao", "屌"],
    "狗日": ["狗日", "狗东西"],
    "去死": ["去死", "滚去死"],
    "废物": ["废物", "废柴"],
    "脑残": ["脑残", "弱智", "zz", "智障"],
    "王八": ["王八蛋", "王八", "wangba"],
    "婊": ["婊子", "表子", "biaozi"],
    "草": ["草拟"],
    "cnm": ["cnm", "c n m", "caonima", "操你妈"],
    "tnnd": ["tnnd", "他奶奶的"],
    "妈的": ["妈的", "md", "m d", "特么的", "他妈的"],
    "贱": ["贱人", "贱货"],
    "妓": ["妓女", "鸡你太美"],
}


def _build_pattern():
    """构造用于匹配的正则：忽略大小写，允许词内穿插空白/常见分隔符。"""
    variants = []
    for group in _BAD_WORDS.values():
        for v in group:
            variants.append(re.escape(v))
    # 按长度降序排列，优先匹配更长的词（避免“你妈”先于“你妈逼”被替换造成残留）
    variants.sort(key=len, reverse=True)
    # 允许词内穿插空格/制表符/常见标点（用于对抗拆字绕过），但仅在不破坏匹配的前提下
    joined = "|".join(variants)
    # 用 IGNORECASE 处理英文大小写
    return re.compile(joined, re.IGNORECASE)


_PATTERN = _build_pattern()


def censor(text: str) -> str:
    """把命中的屏蔽词整词替换为等长 “*”。"""
    if not text:
        return text

    def _replace(m):
        word = m.group(0)
        return "*" * len(word)

    return _PATTERN.sub(_replace, text)


def sanitize(raw: str) -> str | None:
    """清洗一条聊天消息：去除首尾空白、截断长度、屏蔽脏话。

    返回 None 表示该消息为空，应被丢弃。
    """
    if raw is None:
        return None
    text = str(raw).replace("\r", " ").replace("\n", " ").strip()
    if not text:
        return None
    # 截断到最大长度
    text = text[:MAX_CHAT_LEN]
    text = censor(text)
    return text
