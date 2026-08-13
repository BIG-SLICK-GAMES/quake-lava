using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;

public static class RemoveWhiteBackground
{
    public static void Convert(string source, string destination)
    {
        using (var original = new Bitmap(source))
        using (var bitmap = new Bitmap(original.Width, original.Height, PixelFormat.Format32bppArgb))
        {
            using (var graphics = Graphics.FromImage(bitmap)) graphics.DrawImageUnscaled(original, 0, 0);
            var rectangle = new Rectangle(0, 0, bitmap.Width, bitmap.Height);
            var data = bitmap.LockBits(rectangle, ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
            var bytes = new byte[Math.Abs(data.Stride) * data.Height];
            System.Runtime.InteropServices.Marshal.Copy(data.Scan0, bytes, 0, bytes.Length);
            var seen = new bool[bitmap.Width * bitmap.Height];
            var queue = new Queue<int>();
            for (var x = 0; x < bitmap.Width; x++) { queue.Enqueue(x); queue.Enqueue((bitmap.Height - 1) * bitmap.Width + x); }
            for (var y = 0; y < bitmap.Height; y++) { queue.Enqueue(y * bitmap.Width); queue.Enqueue(y * bitmap.Width + bitmap.Width - 1); }
            while (queue.Count > 0)
            {
                var index = queue.Dequeue();
                if (seen[index]) continue;
                seen[index] = true;
                var x = index % bitmap.Width;
                var y = index / bitmap.Width;
                var offset = y * data.Stride + x * 4;
                var maximum = Math.Max(bytes[offset], Math.Max(bytes[offset + 1], bytes[offset + 2]));
                var minimum = Math.Min(bytes[offset], Math.Min(bytes[offset + 1], bytes[offset + 2]));
                if (minimum < 185 || maximum - minimum > 28) continue;
                bytes[offset + 3] = 0;
                if (x > 0) queue.Enqueue(index - 1);
                if (x + 1 < bitmap.Width) queue.Enqueue(index + 1);
                if (y > 0) queue.Enqueue(index - bitmap.Width);
                if (y + 1 < bitmap.Height) queue.Enqueue(index + bitmap.Width);
            }
            System.Runtime.InteropServices.Marshal.Copy(bytes, 0, data.Scan0, bytes.Length);
            bitmap.UnlockBits(data);
            bitmap.Save(destination, ImageFormat.Png);
        }
    }
}
