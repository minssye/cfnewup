<script>
/* Theme skin switcher — purely additive. Persists to localStorage['cp-theme']
   and reflects the choice on <html data-theme="dark|light">. The page's own
   logic is untouched. */
(function () {
    var KEY = 'cp-theme';
    var 根 = document.documentElement;

    function 读取() {
        try {
            var t = localStorage.getItem(KEY);
            if (t === 'light' || t === 'dark') return t;
        } catch (e) {}
        return 'dark';
    }

    function 是否波斯() {
        return (根.getAttribute('lang') || '').toLowerCase().indexOf('fa') === 0;
    }

    function 应用(主题) {
        根.setAttribute('data-theme', 主题);
        var 按钮 = document.getElementById('cpThemeToggle');
        if (!按钮) return;
        按钮.setAttribute('data-current', 主题);
        var 波斯 = 是否波斯();
        var 名称 = 主题 === 'light' ? (波斯 ? 'روشن' : '浅色') : (波斯 ? 'تیره' : '深色');
        var 提示 = (波斯 ? 'تغییر پوسته' : '切换主题皮肤') + ' — ' + 名称;
        var 文字 = document.getElementById('cpThemeLabel');
        if (文字) 文字.textContent = 名称;
        按钮.setAttribute('title', 提示);
        按钮.setAttribute('aria-label', 提示);
    }

    function 切换() {
        var 下一个 = 根.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
        try { localStorage.setItem(KEY, 下一个); } catch (e) {}
        应用(下一个);
    }

    window.切换主题皮肤 = 切换;
    window.应用主题皮肤 = 应用;

    function 绑定() {
        var 按钮 = document.getElementById('cpThemeToggle');
        if (按钮 && !按钮.getAttribute('data-cp-theme-bound')) {
            按钮.setAttribute('data-cp-theme-bound', '1');
            按钮.addEventListener('click', 切换);
        }
        应用(读取());
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', 绑定);
    } else {
        绑定();
    }
})();
</script>