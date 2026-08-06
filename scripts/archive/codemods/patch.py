with open('src/main.tsx', 'r') as f:
    content = f.read()

patch = """// Suppress benign HTMLMediaElement play() interrupted errors globally
const originalPlay = HTMLMediaElement.prototype.play;
if (originalPlay) {
  HTMLMediaElement.prototype.play = function () {
    try {
      const promise = originalPlay.apply(this, arguments as any);
      if (promise !== undefined) {
        promise.catch(error => {
          if (error.name === 'NotAllowedError' || error.message.includes('interrupted') || error.name === 'AbortError') {
            // Ignore benign media play interruption
            return;
          }
          throw error;
        });
      }
      return promise;
    } catch (e) {
      return Promise.resolve();
    }
  };
}

"""

if "originalPlay" not in content:
    content = patch + content
    with open('src/main.tsx', 'w') as f:
        f.write(content)
