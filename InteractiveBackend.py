from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
import csv
import os

# 配置 Flask 同时作为 Web 服务器
app = Flask(__name__, static_folder='.', static_url_path='')
CORS(app)

# 确保文件夹存在
SAVE_FOLDER = 'SwapDatas'
SAVE_PATH = os.path.join(SAVE_FOLDER, 'InputDatas.csv')

if not os.path.exists(SAVE_FOLDER):
    os.makedirs(SAVE_FOLDER)

# 路由：访问根目录时返回 index.html
@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

# 路由：处理组件加载（解决 components/ 路径问题）
@app.route('/components/<path:path>')
def send_components(path):
    return send_from_directory('components', path)

# 路由：数据保存接口
@app.route('/api/save-config', methods=['POST'])
def save_config():
    try:
        data = request.json
        with open(SAVE_PATH, mode='w', newline='', encoding='utf-8-sig') as f:
            writer = csv.writer(f)
            writer.writerow(['Panel', 'Parameter', 'Value'])
            for item in data:
                writer.writerow([item['panel'], item['parameter'], item['value']])
        
        print(f"Successfully saved to {SAVE_PATH}")
        return jsonify({"status": "success", "message": f"Saved to {SAVE_PATH}"})
    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({"status": "error", "message": str(e)}), 500

if __name__ == '__main__':
    print("------------------------------------------")
    print("仿真系统服务器已启动！")
    print("直接点击此链接进行访问: http://localhost:8080")
    print("------------------------------------------")
    # 使用 8080 端口启动
    app.run(port=8080, debug=True)
