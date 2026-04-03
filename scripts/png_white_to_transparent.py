#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
PNG图像白色背景透明化脚本

将指定文件夹中所有PNG图像的白色背景（高于指定阈值的像素）转换为透明。

使用方法:
    python png_white_to_transparent.py <文件夹路径> [--threshold <阈值>] [--output <输出文件夹>]

参数:
    文件夹路径      包含PNG图像的文件夹路径
    --threshold    白色阈值，默认240（0-255，高于此值的像素变透明）
    --output       输出文件夹路径，默认在原文件夹后加"_transparent"

示例:
    python png_white_to_transparent.py ./images
    python png_white_to_transparent.py ./images --threshold 220
    python png_white_to_transparent.py ./images --threshold 230 --output ./output
"""

import os
import sys
import argparse
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    print("错误: 需要安装 Pillow 库")
    print("请运行: pip install Pillow")
    sys.exit(1)


def make_white_transparent(image_path: str, threshold: int, output_path: str) -> bool:
    """
    将图像中的白色背景转换为透明
    
    Args:
        image_path: 输入图像路径
        threshold: 白色阈值（0-255）
        output_path: 输出图像路径
    
    Returns:
        bool: 处理是否成功
    """
    try:
        # 打开图像
        img = Image.open(image_path)
        
        # 转换为RGBA模式（如果还不是）
        if img.mode != 'RGBA':
            img = img.convert('RGBA')
        
        # 获取像素数据
        pixels = img.load()
        width, height = img.size
        
        # 遍历所有像素
        for y in range(height):
            for x in range(width):
                r, g, b, a = pixels[x, y]
                
                # 如果RGB三个通道都高于阈值，则认为是白色背景
                if r >= threshold and g >= threshold and b >= threshold:
                    # 将该像素设为完全透明
                    pixels[x, y] = (r, g, b, 0)
        
        # 确保输出目录存在
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # 保存图像
        img.save(output_path, 'PNG')
        return True
    
    except Exception as e:
        print(f"处理 {image_path} 时出错: {e}")
        return False


def process_folder(input_folder: str, threshold: int, output_folder: str = None) -> dict:
    """
    处理文件夹中的所有PNG图像
    
    Args:
        input_folder: 输入文件夹路径
        threshold: 白色阈值
        output_folder: 输出文件夹路径（可选）
    
    Returns:
        dict: 处理结果统计
    """
    input_path = Path(input_folder)
    
    if not input_path.exists():
        print(f"错误: 文件夹 '{input_folder}' 不存在")
        return None
    
    if not input_path.is_dir():
        print(f"错误: '{input_folder}' 不是一个文件夹")
        return None
    
    # 设置输出文件夹
    if output_folder is None:
        output_path = input_path.parent / f"{input_path.name}_transparent"
    else:
        output_path = Path(output_folder)
    
    # 查找所有PNG文件
    png_files = list(input_path.glob("*.png")) + list(input_path.glob("*.PNG"))
    
    if not png_files:
        print(f"警告: 在 '{input_folder}' 中没有找到PNG文件")
        return {"total": 0, "success": 0, "failed": 0}
    
    print(f"找到 {len(png_files)} 个PNG文件")
    print(f"白色阈值: {threshold}")
    print(f"输出文件夹: {output_path}")
    print("-" * 50)
    
    # 处理统计
    stats = {"total": len(png_files), "success": 0, "failed": 0}
    
    for png_file in png_files:
        # 构建输出路径，保持原有目录结构
        relative_path = png_file.relative_to(input_path)
        output_file = output_path / relative_path
        
        print(f"处理: {png_file.name}", end=" ... ")
        
        if make_white_transparent(str(png_file), threshold, str(output_file)):
            print("✓ 成功")
            stats["success"] += 1
        else:
            print("✗ 失败")
            stats["failed"] += 1
    
    print("-" * 50)
    print(f"处理完成: 成功 {stats['success']}, 失败 {stats['failed']}")
    
    return stats


def main():
    parser = argparse.ArgumentParser(
        description="将PNG图像中的白色背景转换为透明",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
    python png_white_to_transparent.py ./images
    python png_white_to_transparent.py ./images --threshold 220
    python png_white_to_transparent.py ./images --threshold 230 --output ./output
        """
    )
    
    parser.add_argument(
        "folder",
        help="包含PNG图像的文件夹路径"
    )
    
    parser.add_argument(
        "--threshold", "-t",
        type=int,
        default=240,
        help="白色阈值（0-255），高于此值的像素将变透明，默认240"
    )
    
    parser.add_argument(
        "--output", "-o",
        help="输出文件夹路径，默认在原文件夹后加'_transparent'"
    )
    
    args = parser.parse_args()
    
    # 验证阈值范围
    if not 0 <= args.threshold <= 255:
        print("错误: 阈值必须在 0-255 范围内")
        sys.exit(1)
    
    # 处理文件夹
    result = process_folder(args.folder, args.threshold, args.output)
    
    if result is None:
        sys.exit(1)
    
    if result["failed"] > 0:
        sys.exit(2)


if __name__ == "__main__":
    main()