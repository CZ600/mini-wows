import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';

const SECTIONS = [
  { id: 'movement', title: '移动控制' },
  { id: 'firing', title: '开火操作' },
  { id: 'scope', title: '瞄准系统' },
  { id: 'torpedo', title: '鱼雷发射' },
  { id: 'skills', title: '技能使用' },
  { id: 'single', title: '单人模式' },
  { id: 'multi', title: '多人模式' },
  { id: 'online', title: '联机流程' },
];

function Key({ children }) {
  return <span className="key">{children}</span>;
}

function MovementSection() {
  return (
    <div id="movement" className="tutorial-section">
      <h2 className="tutorial-section-title">移动控制</h2>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">基本移动</h3>
        <p className="tutorial-text">
          使用 <Key>W</Key> <Key>A</Key> <Key>S</Key> <Key>D</Key> 键控制舰船移动方向：
        </p>
        <div className="tutorial-keys">
          <div className="tutorial-key-item"><Key>W</Key> <span>加速（提升档位）</span></div>
          <div className="tutorial-key-item"><Key>S</Key> <span>减速（降低档位）</span></div>
          <div className="tutorial-key-item"><Key>A</Key> <span>左转</span></div>
          <div className="tutorial-key-item"><Key>D</Key> <span>右转</span></div>
        </div>
      </div>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">档位系统</h3>
        <p className="tutorial-text">
          游戏采用档位系统控制舰船速度，共 6 个档位（0-5档）：
        </p>
        <ul className="tutorial-list">
          <li><strong>0档</strong>：倒车，舰船缓慢后退</li>
          <li><strong>1档</strong>：怠速，舰船缓慢前进</li>
          <li><strong>2档</strong>：低速前进</li>
          <li><strong>3档</strong>：中速前进</li>
          <li><strong>4档</strong>：高速前进</li>
          <li><strong>5档</strong>：全速前进</li>
        </ul>
        <div className="tutorial-note">
          提示：按 <Key>W</Key> 提升一个档位，按 <Key>S</Key> 降低一个档位。档位越高，舰船速度越快，但转向灵活性会降低。
        </div>
      </div>
    </div>
  );
}

function FiringSection() {
  return (
    <div id="firing" className="tutorial-section">
      <h2 className="tutorial-section-title">开火操作</h2>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">主炮开火</h3>
        <p className="tutorial-text">
          点击鼠标左键发射主炮。主炮会自动瞄准准星方向的目标。
        </p>
        <div className="tutorial-keys">
          <div className="tutorial-key-item"><Key>鼠标左键</Key> <span>发射主炮</span></div>
        </div>
      </div>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">武器切换</h3>
        <p className="tutorial-text">
          使用数字键切换武器模式：
        </p>
        <div className="tutorial-keys">
          <div className="tutorial-key-item"><Key>1</Key> <span>切换到主炮模式</span></div>
          <div className="tutorial-key-item"><Key>2</Key> <span>切换到鱼雷等级 1</span></div>
          <div className="tutorial-key-item"><Key>3</Key> <span>切换到鱼雷等级 2</span></div>
          <div className="tutorial-key-item"><Key>4</Key> <span>切换到鱼雷等级 3</span></div>
        </div>
      </div>

      <div className="tutorial-highlight">
        提示：主炮有冷却时间，冷却期间无法开火。不同等级的舰船拥有不同的火炮数量和伤害。
      </div>
    </div>
  );
}

function ScopeSection() {
  return (
    <div id="scope" className="tutorial-section">
      <h2 className="tutorial-section-title">瞄准系统</h2>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">瞄准镜</h3>
        <p className="tutorial-text">
          点击鼠标右键开启或关闭瞄准镜。瞄准镜模式下，视野会放大，便于精确瞄准远处目标。
        </p>
        <div className="tutorial-keys">
          <div className="tutorial-key-item"><Key>鼠标右键</Key> <span>开启/关闭瞄准镜</span></div>
          <div className="tutorial-key-item"><Key>鼠标滚轮</Key> <span>缩放视野（瞄准镜模式下）</span></div>
        </div>
      </div>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">瞄准镜高度调整</h3>
        <p className="tutorial-text">
          在瞄准镜模式下，可以使用 Q/E 键调整瞄准镜的俯仰角度：
        </p>
        <div className="tutorial-keys">
          <div className="tutorial-key-item"><Key>Q</Key> <span>抬高瞄准镜（看向更高处）</span></div>
          <div className="tutorial-key-item"><Key>E</Key> <span>压低瞄准镜（看向更低处）</span></div>
        </div>
      </div>

      <div className="tutorial-note">
        提示：瞄准镜刻度线可以帮助你估算距离和弹道。远距离目标需要抬高炮口以补偿弹道下坠。
      </div>
    </div>
  );
}

function TorpedoSection() {
  return (
    <div id="torpedo" className="tutorial-section">
      <h2 className="tutorial-section-title">鱼雷发射</h2>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">鱼雷选择</h3>
        <p className="tutorial-text">
          使用数字键 2/3/4 选择不同等级的鱼雷。每个等级的鱼雷有不同的特性：
        </p>
        <ul className="tutorial-list">
          <li><strong>等级 1</strong>：基础鱼雷，速度和射程均衡</li>
          <li><strong>等级 2</strong>：高速鱼雷，速度更快但射程较短</li>
          <li><strong>等级 3</strong>：远程鱼雷，射程更远但速度较慢</li>
        </ul>
      </div>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">散射模式</h3>
        <p className="tutorial-text">
          选择鱼雷后，再次按下相同的数字键可以切换散射角度：
        </p>
        <div className="tutorial-keys">
          <div className="tutorial-key-item"><Key>2</Key> / <Key>3</Key> / <Key>4</Key> <span>切换窄角/广角散射</span></div>
        </div>
        <ul className="tutorial-list">
          <li><strong>窄角散射</strong>：鱼雷集中发射，适合瞄准单个目标</li>
          <li><strong>广角散射</strong>：鱼雷分散发射，适合覆盖区域</li>
        </ul>
      </div>

      <div className="tutorial-highlight">
        提示：不同舰船类型可用的鱼雷等级不同。驱逐舰拥有所有等级的鱼雷，巡洋舰只有等级 1，战列舰没有鱼雷。
      </div>
    </div>
  );
}

function SkillsSection() {
  return (
    <div id="skills" className="tutorial-section">
      <h2 className="tutorial-section-title">技能使用</h2>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">技能列表</h3>
        <p className="tutorial-text">
          游戏中有 3 种技能，使用 F/G/H 键激活：
        </p>
        <div className="tutorial-keys">
          <div className="tutorial-key-item"><Key>F</Key> <span>急速射击</span></div>
          <div className="tutorial-key-item"><Key>G</Key> <span>损害管制</span></div>
          <div className="tutorial-key-item"><Key>H</Key> <span>精准射击</span></div>
        </div>
      </div>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">技能效果</h3>
        <ul className="tutorial-list">
          <li><strong>急速射击</strong>：持续 10 秒，主炮冷却时间减少 30%，冷却时间 80 秒</li>
          <li><strong>损害管制</strong>：持续 10 秒，每秒恢复最大生命值的 3%，冷却时间 40 秒</li>
          <li><strong>精准射击</strong>：持续 10 秒，主炮散布减少 30%，冷却时间 60 秒</li>
        </ul>
      </div>

      <div className="tutorial-note">
        提示：技能有冷却时间，需要合理规划使用时机。在关键时刻使用技能可以扭转战局。
      </div>
    </div>
  );
}

function SingleModeSection() {
  return (
    <div id="single" className="tutorial-section">
      <h2 className="tutorial-section-title">单人模式</h2>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">关卡系统</h3>
        <p className="tutorial-text">
          单人模式共有 10 个关卡，难度逐渐递增。每个关卡需要消灭所有敌人才能通关。
        </p>
        <ul className="tutorial-list">
          <li><strong>第 1-3 关</strong>：基础训练，敌人数量少，血量低</li>
          <li><strong>第 4-6 关</strong>：中等难度，敌人数量增加，开始出现精英敌人</li>
          <li><strong>第 7-10 关</strong>：高难度，敌人数量多，血量高，需要策略应对</li>
        </ul>
      </div>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">升级机制</h3>
        <p className="tutorial-text">
          击毁敌人可以获得经验值，积累足够经验后舰船会升级（最高 10 级）。升级后：
        </p>
        <ul className="tutorial-list">
          <li>生命值增加</li>
          <li>主炮伤害提升</li>
          <li>火炮数量增加</li>
          <li>舰船尺寸变大</li>
        </ul>
      </div>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">舰船类型解锁</h3>
        <p className="tutorial-text">
          达到 4 级后，可以选择不同的舰船类型：
        </p>
        <ul className="tutorial-list">
          <li><strong>驱逐舰</strong>：高速、高机动，擅长鱼雷攻击</li>
          <li><strong>巡洋舰</strong>：均衡型，主炮伤害高，冷却短</li>
          <li><strong>战列舰</strong>：高血量、高伤害，但速度慢，无鱼雷</li>
        </ul>
      </div>
    </div>
  );
}

function MultiModeSection() {
  return (
    <div id="multi" className="tutorial-section">
      <h2 className="tutorial-section-title">多人模式</h2>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">舰船类型</h3>
        <p className="tutorial-text">
          多人模式中，玩家可以从三种舰船类型中选择：
        </p>
        <ul className="tutorial-list">
          <li><strong>驱逐舰</strong>：速度最快，机动性最强，血量较低。拥有所有等级鱼雷（1-3级），最多 4-8 个鱼雷发射管。适合快速突击和鱼雷攻击。</li>
          <li><strong>巡洋舰</strong>：各项属性均衡，主炮伤害高（1.3倍），冷却时间短（0.7倍）。只有等级 1 鱼雷，2-4 个发射管。适合远程火力支援。</li>
          <li><strong>战列舰</strong>：血量最高（1.4倍），主炮伤害极高（3倍），但速度慢（0.7倍），无鱼雷。适合正面硬刚和坦克输出。</li>
        </ul>
      </div>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">团队配合</h3>
        <p className="tutorial-text">
          多人模式强调团队配合，不同舰船类型有各自的优势：
        </p>
        <ul className="tutorial-list">
          <li>驱逐舰利用高速机动，绕后攻击或吸引火力</li>
          <li>巡洋舰在中距离提供稳定输出</li>
          <li>战列舰在前线承受伤害并输出高额火力</li>
        </ul>
      </div>
    </div>
  );
}

function OnlineFlowSection() {
  return (
    <div id="online" className="tutorial-section">
      <h2 className="tutorial-section-title">联机流程</h2>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">快速匹配</h3>
        <p className="tutorial-text">
          在多人模式界面点击"快速匹配"按钮，系统会自动为你匹配对手。匹配成功后直接进入游戏。
        </p>
      </div>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">创建房间</h3>
        <p className="tutorial-text">
          点击"创建房间"按钮创建一个新房间。创建房间后：
        </p>
        <ul className="tutorial-list">
          <li>选择舰船类型（驱逐舰/巡洋舰/战列舰）</li>
          <li>等待其他玩家加入</li>
          <li>房主点击"开始游戏"开始对战</li>
        </ul>
      </div>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">加入房间</h3>
        <p className="tutorial-text">
          点击"加入房间"按钮，输入房间号即可加入已有房间。
        </p>
      </div>

      <div className="tutorial-subsection">
        <h3 className="tutorial-subsection-title">房间内操作</h3>
        <ul className="tutorial-list">
          <li><strong>选择舰船</strong>：在房间内选择你想要使用的舰船类型</li>
          <li><strong>准备</strong>：点击准备按钮，表示你已准备好开始游戏</li>
          <li><strong>开始游戏</strong>：房主在所有玩家准备好后可以开始游戏</li>
          <li><strong>退出房间</strong>：点击退出按钮离开当前房间</li>
        </ul>
      </div>
    </div>
  );
}

export default function TutorialPage() {
  const navigate = useNavigate();
  const [activeSection, setActiveSection] = useState('movement');
  const contentRef = useRef(null);
  const observerRef = useRef(null);

  const handleNavClick = useCallback((sectionId) => {
    const element = document.getElementById(sectionId);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  }, []);

  useEffect(() => {
    const content = contentRef.current;
    if (!content) return;

    observerRef.current = new IntersectionObserver(
      (entries) => {
        const visibleEntries = entries.filter(entry => entry.isIntersecting);
        if (visibleEntries.length > 0) {
          const topEntry = visibleEntries.reduce((prev, curr) =>
            prev.boundingClientRect.top < curr.boundingClientRect.top ? prev : curr
          );
          setActiveSection(topEntry.target.id);
        }
      },
      {
        root: content,
        rootMargin: '-10% 0px -80% 0px',
        threshold: 0,
      }
    );

    const sections = content.querySelectorAll('.tutorial-section');
    sections.forEach(section => observerRef.current.observe(section));

    return () => {
      if (observerRef.current) {
        observerRef.current.disconnect();
      }
    };
  }, []);

  return (
    <div id="tutorial-page">
      <div className="tutorial-header">
        <button className="tutorial-back-btn" onClick={() => navigate('/')}>
          ← 返回首页
        </button>
        <h1 className="tutorial-title">3D 海战 - 游戏教程</h1>
      </div>

      <div className="tutorial-body">
        <nav className="tutorial-sidebar">
          {SECTIONS.map(section => (
            <button
              key={section.id}
              className={`tutorial-nav-item ${activeSection === section.id ? 'active' : ''}`}
              onClick={() => handleNavClick(section.id)}
            >
              {section.title}
            </button>
          ))}
        </nav>

        <div className="tutorial-content" ref={contentRef}>
          <MovementSection />
          <FiringSection />
          <ScopeSection />
          <TorpedoSection />
          <SkillsSection />
          <SingleModeSection />
          <MultiModeSection />
          <OnlineFlowSection />
        </div>
      </div>
    </div>
  );
}
