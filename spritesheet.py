# This class handles sprite sheets
# This was taken from www.scriptefun.com/transcript-2-using
# sprite-sheets-and-drawing-the-background
# I've added some code to fail if the file wasn't found..
# Note: When calling images_at the rect is the format:
# (x, y, x + offset, y + offset)
import pygame.transform
from pygame import Surface, Rect
from pygame import error, image
from pygame import RLEACCEL
from typing import List, Dict, Tuple
from json import load


class Spritesheet(object):

    def __init__(self, filename) -> None:
        try:
            self.sheet = image.load(filename).convert_alpha()

        except error as message:
            print('Unable to load spritesheet image:', filename)
            raise SystemExit(message)

    # get the sizes of the spritesheet
    def get_size(self) -> Tuple[int, int]:
        return self.sheet.get_size()

    # Load a specific image from a specific rectangle
    def image_at(self, rectangle, colorkey=None, rotate=False) -> Surface:
        """Loads image from x,y,x+offset,y+offset"""

        rect = Rect(rectangle)
        image = Surface(rect.size, pygame.SRCALPHA)
        image.blit(self.sheet, (0, 0), rect)
        if colorkey is not None:
            if colorkey == -1:
                colorkey = image.get_at((0, 0))
            image.set_colorkey(colorkey, RLEACCEL)

        return image

    # Load a whole bunch of images and return them as a list
    def images_at(self, rects, colorkey=None) -> List[Surface]:
        """Loads multiple images, supply a list of coordinates"""
        return [self.image_at(rect, colorkey) for rect in rects]

    # Load a whole strip of images
    def load_strip(self, rect, image_count, colorkey=None) -> List[Surface]:
        """Loads a strip of images and returns them as a list"""
        tups = [(rect[0]+rect[2]*x, rect[1], rect[2], rect[3])
                for x in range(image_count)]

        return self.images_at(tups, colorkey)

    # Load a spritesheet JSON datafile
    def images_datafile(self, filename, colorkey=None) -> Dict[str, Surface]:
        """Loads a spritesheet JSON datafile and returns them as a dict"""
        datafile = load(open(filename))
        output = {}

        for sprite in datafile:
            img = self.image_at(sprite["position"], colorkey)
            if sprite.get("rotate", False):
                img = pygame.transform.rotate(img, 90)
            output[sprite["sprite_id"]] = img

        return output
