"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Star } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "sonner";

interface RatingFormProps {
  pickupId: string;
  userId: string;
  role: "bwg" | "collector";
  onSubmitted?: () => void;
}

export function RatingForm({ pickupId, userId, role, onSubmitted }: RatingFormProps) {
  const supabase = createClient();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (rating === 0) {
      toast.error("Please select a rating");
      return;
    }
    setSubmitting(true);

    const { error } = await supabase.from("pickup_ratings").insert({
      pickup_id: pickupId,
      rated_by: userId,
      role,
      rating,
      comment: comment.trim() || null,
    });

    if (error) {
      toast.error("Failed to submit rating");
      setSubmitting(false);
      return;
    }

    toast.success("Rating submitted!");
    setSubmitting(false);
    onSubmitted?.();
  }

  const displayRating = hoveredRating || rating;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Rate this Pickup</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Rating</Label>
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setRating(value)}
                  onMouseEnter={() => setHoveredRating(value)}
                  onMouseLeave={() => setHoveredRating(0)}
                  className="p-0.5 transition-colors"
                >
                  <Star
                    className={`h-7 w-7 ${
                      value <= displayRating
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="rating-comment">Comment (optional)</Label>
            <Textarea
              id="rating-comment"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Share your experience..."
              rows={3}
            />
          </div>
          <Button type="submit" disabled={submitting || rating === 0}>
            {submitting ? "Submitting..." : "Submit Rating"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

interface RatingDisplayProps {
  ratings: {
    id: string;
    rating: number;
    comment: string | null;
    role: string;
    created_at: string;
  }[];
}

export function RatingDisplay({ ratings }: RatingDisplayProps) {
  if (ratings.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ratings</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {ratings.map((r) => (
            <div key={r.id} className="border-b pb-3 last:border-0 last:pb-0">
              <div className="flex items-center gap-2 mb-1">
                <div className="flex">
                  {[1, 2, 3, 4, 5].map((value) => (
                    <Star
                      key={value}
                      className={`h-4 w-4 ${
                        value <= r.rating
                          ? "fill-yellow-400 text-yellow-400"
                          : "text-muted-foreground"
                      }`}
                    />
                  ))}
                </div>
                <span className="text-xs text-muted-foreground capitalize">
                  by {r.role}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(r.created_at).toLocaleDateString()}
                </span>
              </div>
              {r.comment && (
                <p className="text-sm text-muted-foreground">{r.comment}</p>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
