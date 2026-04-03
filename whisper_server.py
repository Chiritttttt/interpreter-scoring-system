from flask import Flask, request, jsonify
from flask_cors import CORS
import whisper
import torch
import tempfile
import os

app = Flask(__name__)
CORS(app)

print("正在加载 Whisper 模型，首次运行会自动下载...")
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"使用设备: {device}")
model = whisper.load_model("small", device=device)
print("模型加载完成！")

@app.route('/health', methods=['GET'])
def health():
    return jsonify({'status': 'ok', 'model': 'small'})

@app.route('/transcribe', methods=['POST'])
def transcribe():
    if 'file' not in request.files:
        return jsonify({'error': '没有收到音频文件'}), 400

    file = request.files['file']
    language = request.form.get('language', 'en')

    suffix = os.path.splitext(file.filename)[1] if file.filename else '.webm'
    if not suffix:
        suffix = '.webm'

    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        file.save(tmp.name)
        tmp_path = tmp.name

    try:
        print(f"开始转录，语言：{language}，文件：{tmp_path}")
        result = model.transcribe(tmp_path, language=language)
        text = result['text'].strip()
        print(f"转录完成：{text[:50]}...")
        return jsonify({'text': text})
    except Exception as e:
        print(f"转录失败：{e}")
        return jsonify({'error': str(e)}), 500
    finally:
        os.unlink(tmp_path)

if __name__ == '__main__':
    print("Whisper 服务启动在 http://localhost:5001")
    app.run(host='0.0.0.0', port=5001, debug=False)
