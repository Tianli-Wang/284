graph LR

前端 (JS) <-> Python (Flask) <-> MATLAB Engine


    A[前端 UI (HTML/JS)] -- HTTP POST (JSON数据) --> B[Python Flask 服务器]
    B -- MATLAB Engine API --> C[MATLAB 仿真核心]
    C -- 计算结果 (Struct/Array) --> B
    B -- JSON 响应 --> A



* 目前的方案是 **同步等待** ：前端发请求 -> 后端调用 MATLAB -> MATLAB 算完 -> 返回。
* 如果仿真需要跑很久（例如 10 分钟），HTTP 请求会超时。
* **进阶方案** :
* Python 端接收到请求后，开启一个**新线程**去跑 MATLAB，并立刻返回一个 "Task ID"。
* 前端每隔 1 秒发送一个请求 `GET /api/status?id=xxx` 轮询进度。
* 前端更新进度条。




function result = RunConstellationSim(params)
    % params: 从 Python 传来的结构体，包含 environment, orbit 等字段

    disp('MATLAB: 接收到仿真请求...');
    disp(params); % 打印看看收到了什么

    % 1. 解析参数 (示例)
    orbitHeight = params.orbit.height;
    simTime = params.system.simTime;

    % 2. 执行你的核心仿真逻辑 (这里用暂停模拟耗时)
    % [status, data] = YourComplexCoreFunction(orbitHeight, ...);
    pause(1); % 模拟计算耗时

    % 3. 封装返回结果
    % 注意：返回给 Python 的数据最好是数值数组、字符串或简单结构体
    result.status = 'success';
    result.message = '仿真完成';
    result.totalLinks = 150;
    result.avgLatency = 12.5;

    % 模拟生成一些时序数据用于前端绘图
    result.timeSeries = 1:simTime;
    result.linkQuality = rand(1, simTime) * 10 + 5; % 随机生成 SNR
end




from flask import Flask, request, jsonify
from flask_cors import CORS
import matlab.engine
import json

app = Flask(__name__)
CORS(app)  # 允许跨域，方便开发调试

# 全局变量存储 MATLAB 引擎实例

eng = None

def init_matlab():
    global eng
    if eng is None:
        print("正在启动 MATLAB 引擎 (可能需要几十秒)...")
        eng = matlab.engine.start_matlab()
        print("MATLAB 引擎启动完成！")

@app.route('/api/start_simulation', methods=['POST'])
def start_simulation():
    global eng
    if not eng:
        init_matlab()

    # 1. 获取前端传来的 JSON 参数
    data = request.json
    print(f"收到前端参数: {data}")

    try:
        # 2. 数据转换：Python Dict -> MATLAB Struct
        # MATLAB Engine 通常能自动处理基础字典，但复杂结构可能需要处理
        # 这里直接传字典，MATLAB 端会识别为 struct

    # 3. 调用 MATLAB 函数
        # nargout=1 表示期待 1 个返回值
        result = eng.RunConstellationSim(data, nargout=1)

    # 4. 返回结果给前端
        return jsonify(result)

    except Exception as e:
        print(f"仿真出错: {str(e)}")
        return jsonify({'status': 'error', 'message': str(e)}), 500

@app.route('/api/stop_simulation', methods=['POST'])
def stop_simulation():
    # 这里可以实现中断逻辑，或者简单的标志位控制
    return jsonify({'status': 'stopped'})

if __name__ == '__main__':
    # 启动服务器前先启动 MATLAB，避免第一次请求太慢
    init_matlab()
    app.run(port=5000, debug=True)
